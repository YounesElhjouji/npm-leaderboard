import argparse
import asyncio
import datetime
import json
import os
import time
from datetime import timedelta
from pathlib import Path

import aiohttp
from pymongo.synchronous.mongo_client import MongoClient


class NPMPackageUpdater:
    def __init__(self, batch_size: int = 100):
        self.registry_url = "https://registry.npmjs.org"
        self.downloads_url = "https://api.npmjs.org/downloads"
        self.ecosystem_url = (
            "https://packages.ecosyste.ms/api/v1/registries/npmjs.org/packages"
        )
        self.semaphore = asyncio.Semaphore(10)  # Limit concurrent requests

        # MongoDB setup
        self.client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/"))
        self.db = self.client["npm-leaderboard"]
        self.collection = self.db["packages"]

        # Setup logging directory
        self.log_dir = Path("data/logs")
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.failed_updates = []

        # Progress tracking
        self.batch_size = batch_size
        self.total_processed = 0
        self.batch_start_time = None
        self.successful_in_current_batch = 0
        self.failed_in_current_batch = 0

    async def fetch_ecosystem_stats(
        self, session: aiohttp.ClientSession, package_name: str
    ) -> dict:
        """Fetch total downloads and dependents from ecosyste.ms."""
        try:
            async with session.get(f"{self.ecosystem_url}/{package_name}") as response:
                if response.status != 200:
                    return {
                        "error": f"Failed to fetch ecosystem stats: {response.status}"
                    }
                data = await response.json()
                return {
                    "total_downloads": data.get("downloads", 0),
                    "dependent_packages_count": data.get("dependent_packages_count", 0),
                    "dependent_repos_count": data.get("dependent_repos_count", 0),
                    "error": None,
                }
        except Exception as e:
            return {"error": str(e)}

    def get_week_boundaries(self) -> tuple[datetime.datetime, datetime.datetime]:
        """
        Calculate the start and end dates for an 8-week period.
        The period starts from the last completed Sunday and goes back 8 weeks.
        """
        today = datetime.datetime.now()
        days_since_sunday = (today.weekday() + 1) % 7  # Days since last Sunday
        last_sunday = today - timedelta(days=days_since_sunday)
        start_date = last_sunday - timedelta(weeks=8)
        return (
            start_date.replace(hour=0, minute=0, second=0, microsecond=0),
            last_sunday,
        )

    def save_failed_updates_log(self):
        """Save the log of failed updates to a file."""
        if self.failed_updates:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            log_file = self.log_dir / f"failed_updates_{timestamp}.log"
            with open(log_file, "w") as f:
                json.dump(self.failed_updates, f, indent=2)
            print(f"Failed updates log saved to: {log_file}")

    async def fetch_weekly_trends(
        self, session: aiohttp.ClientSession, package_name: str
    ) -> dict:
        """
        Fetch weekly download trends for an 8-week period.
        Weeks are computed from Monday to Sunday based on the most recent complete week.
        """
        try:
            start_date, end_date = self.get_week_boundaries()
            downloads_url = (
                f"{self.downloads_url}/range/"
                f"{start_date.strftime('%Y-%m-%d')}:{end_date.strftime('%Y-%m-%d')}/"
                f"{package_name}"
            )
            async with self.semaphore:
                async with session.get(downloads_url) as response:
                    if response.status != 200:
                        return {
                            "error": f"Failed to fetch download stats: {response.status}"
                        }
                    download_data = await response.json()

            # Process downloads by week (Monday to Sunday)
            downloads_by_week = []
            current_week = []
            current_week_start = None

            for day_data in download_data.get("downloads", []):
                day_date = datetime.datetime.strptime(day_data["day"], "%Y-%m-%d")
                # Start a new week on Monday
                if day_date.weekday() == 0:
                    if current_week:
                        week_end = day_date - timedelta(days=1)  # Previous Sunday
                        downloads_by_week.append(
                            {
                                "week_ending": week_end.strftime("%Y-%m-%d"),
                                "downloads": sum(current_week),
                            }
                        )
                    current_week = []
                    current_week_start = day_date
                current_week.append(day_data["downloads"])

            # Add the last week if it's complete (7 days)
            if current_week and len(current_week) == 7:
                week_end = current_week_start + timedelta(days=6)
                downloads_by_week.append(
                    {
                        "week_ending": week_end.strftime("%Y-%m-%d"),
                        "downloads": sum(current_week),
                    }
                )

            return {"weekly_trends": downloads_by_week, "error": None}
        except Exception as e:
            return {"error": str(e)}

    def log_failed_update(self, package_name: str, error: str):
        """Log a package that failed to update."""
        self.failed_updates.append(
            {
                "package": package_name,
                "error": error,
                "timestamp": datetime.datetime.now().isoformat(),
                "batch_number": (self.total_processed // self.batch_size) + 1,
            }
        )
        self.failed_in_current_batch += 1

    def print_batch_progress(self, current_batch: int, total_batches: int):
        """Print progress information for the current batch."""
        if self.batch_start_time:
            elapsed = time.time() - self.batch_start_time
            success_rate = (
                (self.successful_in_current_batch / self.batch_size) * 100
                if self.batch_size > 0
                else 0
            )

            print(f"\n--- Batch {current_batch}/{total_batches} Progress ---")
            print(f"Successful in this batch: {self.successful_in_current_batch}")
            print(f"Failed in this batch: {self.failed_in_current_batch}")
            print(f"Success rate: {success_rate:.1f}%")
            print(f"Batch processing time: {elapsed:.1f} seconds")
            if self.successful_in_current_batch > 0:
                print(
                    f"Average time per successful update: {elapsed/self.successful_in_current_batch:.1f} seconds"
                )
            print(f"Total packages processed so far: {self.total_processed}")

    def get_npm_timestamps(self, package_data):
        """
        Extract the package creation and last modified timestamps from npm data.
        These timestamps come from the 'time' field in the package metadata.

        Returns:
        tuple: (npm_created_at, npm_modified_at)
        """
        try:
            time_data = package_data.get("time", {})

            # Get created time - this is when the package was first published
            npm_created_at = time_data.get("created")

            # Get modified time - this is when the package was last updated
            npm_modified_at = time_data.get("modified")

            return npm_created_at, npm_modified_at
        except Exception:
            return None, None

    async def update_package_info(self, session: aiohttp.ClientSession, package_doc):
        """Update package info with latest stats from npm registry and ecosystem stats."""
        package_name = package_doc["name"]
        try:
            async with self.semaphore:
                # Fetch package metadata from npm registry
                async with session.get(
                    f"{self.registry_url}/{package_name}"
                ) as response:
                    if response.status != 200:
                        raise Exception(
                            f"Failed to fetch package info: {response.status}"
                        )
                    data = await response.json()

            # Fetch ecosystem statistics (downloads, dependents)
            ecosystem_stats = await self.fetch_ecosystem_stats(session, package_name)
            if ecosystem_stats.get("error"):
                raise Exception(ecosystem_stats["error"])

            # Fetch weekly download trends
            weekly_stats = await self.fetch_weekly_trends(session, package_name)
            if weekly_stats.get("error"):
                raise Exception(weekly_stats["error"])

            # Process package data
            latest_version = data.get("dist-tags", {}).get("latest")
            if not latest_version or "versions" not in data:
                raise Exception("No version information found")
            latest_data = data["versions"][latest_version]

            peer_dependencies = list(latest_data.get("peerDependencies", {}).keys())

            # Get npm timestamps
            npm_created_at, npm_modified_at = self.get_npm_timestamps(data)

            # Update fields
            update_fields = {
                "description": data.get("description", ""),
                "link": f"https://www.npmjs.com/package/{package_name}",
                "dependencies": list(latest_data.get("dependencies", {}).keys()),
                "peerDependencies": peer_dependencies,
                "downloads": {
                    "total": ecosystem_stats["total_downloads"],
                    "weekly_trends": weekly_stats["weekly_trends"],
                },
                "dependent_packages_count": ecosystem_stats["dependent_packages_count"],
                "dependent_repos_count": ecosystem_stats["dependent_repos_count"],
                "latest_version": latest_version,
                "npm_timestamps": {
                    "created_at": npm_created_at,
                    "modified_at": npm_modified_at,
                },
                "db_updated_at": datetime.datetime.now(),
            }

            # Update document in MongoDB
            self.collection.update_one({"name": package_name}, {"$set": update_fields})
            # print(f"✓ Updated package: {package_name}")
            self.successful_in_current_batch += 1

        except Exception as e:
            error_msg = f"✗ Error updating {package_name}: {str(e)}"
            print(error_msg)
            self.log_failed_update(package_name, str(e))

    async def update_batch(
        self,
        session: aiohttp.ClientSession,
        batch: list,
        batch_num: int,
        total_batches: int,
    ):
        """Update a batch of packages."""
        self.batch_start_time = time.time()
        self.successful_in_current_batch = 0
        self.failed_in_current_batch = 0

        print(f"\nStarting batch {batch_num}/{total_batches} ({len(batch)} packages)")

        tasks = [self.update_package_info(session, pkg) for pkg in batch]
        await asyncio.gather(*tasks)

        self.total_processed += len(batch)
        self.print_batch_progress(batch_num, total_batches)

    async def update_all_packages(self):
        """Update all packages in the database in batches."""
        packages = list(self.collection.find({}, {"name": 1}))
        total_packages = len(packages)

        print(f"\nInitial Status:")
        print(f"Total packages in database: {total_packages}")

        if total_packages == 0:
            print("No packages found to update!")
            return

        # Calculate batches
        batches = [
            packages[i : i + self.batch_size]
            for i in range(0, total_packages, self.batch_size)
        ]
        total_batches = len(batches)

        print(
            f"\nProcessing will be done in {total_batches} batches of {self.batch_size} packages each"
        )

        async with aiohttp.ClientSession() as session:
            for batch_num, batch in enumerate(batches, 1):
                await self.update_batch(session, batch, batch_num, total_batches)

        # Save failed updates log
        self.save_failed_updates_log()

        # Print final summary
        print("\n=== Final Update Summary ===")
        print(f"Total packages processed: {self.total_processed}")
        print(f"Total successful: {self.total_processed - len(self.failed_updates)}")
        print(f"Total failed: {len(self.failed_updates)}")
        success_rate = (
            (
                (self.total_processed - len(self.failed_updates))
                / self.total_processed
                * 100
            )
            if self.total_processed > 0
            else 0
        )
        print(f"Overall success rate: {success_rate:.1f}%")


def main():
    parser = argparse.ArgumentParser(
        description="Update existing npm packages in batches."
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Number of packages to update in each batch",
    )
    args = parser.parse_args()

    updater = NPMPackageUpdater(batch_size=args.batch_size)
    asyncio.run(updater.update_all_packages())


if __name__ == "__main__":
    start_time = time.time()
    main()
    print(f"\nTotal execution time: {time.time() - start_time:.2f} seconds")

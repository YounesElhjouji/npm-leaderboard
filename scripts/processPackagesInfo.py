import asyncio
import datetime
import json
import time
from datetime import timedelta
from pathlib import Path
from typing import Dict, List

import aiohttp
from pymongo import MongoClient


class NPMPackageProcessor:
    def __init__(self, input_file: str):
        self.input_file = input_file
        self.registry_url = "https://registry.npmjs.org"
        self.downloads_url = "https://api.npmjs.org/downloads"
        self.ecosystem_url = (
            "https://packages.ecosyste.ms/api/v1/registries/npmjs.org/packages"
        )
        self.semaphore = asyncio.Semaphore(10)  # Limit concurrent requests

        # MongoDB setup
        self.client = MongoClient("mongodb://localhost:27017/")
        self.db = self.client["npm-leaderboard"]
        self.collection = self.db["packages"]

        # Setup logging directory
        self.log_dir = Path("data/logs")
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.failed_packages = []

    async def fetch_ecosystem_stats(
        self, session: aiohttp.ClientSession, package_name: str
    ) -> Dict:
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
                    "dependent_count": data.get("dependent_packages_count", 0),
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

    async def fetch_weekly_trends(
        self, session: aiohttp.ClientSession, package_name: str
    ) -> Dict:
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

    def log_failed_package(self, package_name: str, error: str):
        """Log a package that failed to process."""
        self.failed_packages.append(
            {
                "package": package_name,
                "error": error,
                "timestamp": datetime.datetime.now().isoformat(),
            }
        )

    def save_failed_packages_log(self):
        """Save the log of failed packages to a file."""
        if self.failed_packages:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            log_file = self.log_dir / f"failed_packages_{timestamp}.log"
            with open(log_file, "w") as f:
                json.dump(self.failed_packages, f, indent=2)
            print(f"Failed packages log saved to: {log_file}")

    async def fetch_and_store_package_info(
        self, session: aiohttp.ClientSession, package_name: str
    ):
        """Fetch package info, enrich it with ecosystem stats, weekly trends, and peer dependencies, then store in MongoDB."""
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

            # Fetch weekly download trends using the updated method
            weekly_stats = await self.fetch_weekly_trends(session, package_name)
            if weekly_stats.get("error"):
                raise Exception(weekly_stats["error"])

            # Get the latest version info and corresponding metadata
            latest_version = data.get("dist-tags", {}).get("latest")
            if not latest_version or "versions" not in data:
                raise Exception("No version information found")
            latest_data = data["versions"][latest_version]

            # Get peer dependencies (newly added in your update)
            peer_dependencies = list(latest_data.get("peerDependencies", {}).keys())

            # Prepare document for MongoDB
            current_time = datetime.datetime.now()
            package_doc = {
                "name": package_name,
                "description": data.get("description", ""),
                "link": f"https://www.npmjs.com/package/{package_name}",
                "dependencies": list(latest_data.get("dependencies", {}).keys()),
                "peerDependencies": peer_dependencies,
                "downloads": {
                    "total": ecosystem_stats["total_downloads"],
                    "weekly_trends": weekly_stats["weekly_trends"],
                },
                "dependent_packages_count": ecosystem_stats["dependent_count"],
                "latest_version": latest_version,
                "created_time": current_time,
                "last_updated": current_time,
            }

            # Insert document into MongoDB
            self.collection.insert_one(package_doc)
            print(f"Successfully processed and stored package: {package_name}")

        except Exception as e:
            error_msg = f"Error processing {package_name}: {str(e)}"
            print(f"WARNING: {error_msg}")
            self.log_failed_package(package_name, str(e))

    async def process_packages(self):
        """Process all packages from the input file."""
        # Load package names from input file
        with open(self.input_file, "r") as f:
            package_names: List[str] = json.load(f)

        print(f"Total packages loaded from file: {len(package_names)}")

        # Retrieve all package names already stored in MongoDB
        existing_packages = set(
            doc["name"] for doc in self.collection.find({}, {"name": 1})
        )
        print(f"Already processed packages in DB: {len(existing_packages)}")

        # Remove packages that are already processed
        to_process = [name for name in package_names if name not in existing_packages]
        print(f"Remaining packages to process: {len(to_process)}")

        # Process each package asynchronously
        async with aiohttp.ClientSession() as session:
            tasks = [
                self.fetch_and_store_package_info(session, name) for name in to_process
            ]
            await asyncio.gather(*tasks)

        # Save log of failed packages (if any)
        self.save_failed_packages_log()

        # Print summary
        total_failed = len(self.failed_packages)
        print(f"\nProcessing complete:")
        print(f"Total packages in input: {len(package_names)}")
        print(f"Already processed: {len(existing_packages)}")
        print(f"Processed in this run: {len(to_process)}")
        print(f"Failed: {total_failed}")
        print(f"Successful: {len(to_process) - total_failed}")


def main():
    input_file = "data/package_names.json"
    processor = NPMPackageProcessor(input_file)
    asyncio.run(processor.process_packages())


if __name__ == "__main__":
    start_time = time.time()
    main()
    print(f"\nTotal execution time: {time.time() - start_time:.2f} seconds")

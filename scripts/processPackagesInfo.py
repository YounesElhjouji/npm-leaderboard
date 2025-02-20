import asyncio
import datetime
import json
import time
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

    async def fetch_weekly_trends(
        self, session: aiohttp.ClientSession, package_name: str
    ) -> Dict:
        """Fetch weekly download trends for the last 2 months."""
        try:
            end_date = datetime.datetime.now()
            start_date = end_date - datetime.timedelta(days=60)
            date_range = (
                f"{start_date.strftime('%Y-%m-%d')}:{end_date.strftime('%Y-%m-%d')}"
            )

            downloads_url = f"{self.downloads_url}/range/{date_range}/{package_name}"
            async with session.get(downloads_url) as response:
                if response.status != 200:
                    return {
                        "error": f"Failed to fetch download stats: {response.status}"
                    }
                download_data = await response.json()

            # Calculate weekly downloads
            downloads_by_week = []
            current_week = []
            for day in download_data.get("downloads", []):
                current_week.append(day["downloads"])
                if len(current_week) == 7:
                    downloads_by_week.append(
                        {"week_ending": day["day"], "downloads": sum(current_week)}
                    )
                    current_week = []

            if current_week:
                downloads_by_week.append(
                    {
                        "week_ending": download_data["downloads"][-1]["day"],
                        "downloads": sum(current_week),
                    }
                )

            return {"weekly_trends": downloads_by_week, "error": None}
        except Exception as e:
            return {"error": str(e)}

    def log_failed_package(self, package_name: str, error: str):
        """Add failed package to the list with error message."""
        self.failed_packages.append(
            {
                "package": package_name,
                "error": error,
                "timestamp": datetime.datetime.now().isoformat(),
            }
        )

    def save_failed_packages_log(self):
        """Save failed packages to a log file."""
        if self.failed_packages:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            log_file = self.log_dir / f"failed_packages_{timestamp}.log"

            with open(log_file, "w") as f:
                json.dump(self.failed_packages, f, indent=2)

            print(f"Failed packages log saved to: {log_file}")

    async def fetch_and_store_package_info(
        self, session: aiohttp.ClientSession, package_name: str
    ):
        """Fetch package info and store in MongoDB if not exists."""
        try:
            # Check if package already exists in database
            if self.collection.find_one({"name": package_name}):
                print(f"Package {package_name} already exists in database, skipping...")
                return

            async with self.semaphore:
                # Get package metadata
                async with session.get(
                    f"{self.registry_url}/{package_name}"
                ) as response:
                    if response.status != 200:
                        raise Exception(
                            f"Failed to fetch package info: {response.status}"
                        )
                    data = await response.json()

                # Get ecosystem statistics
                ecosystem_stats = await self.fetch_ecosystem_stats(
                    session, package_name
                )
                if ecosystem_stats.get("error"):
                    raise Exception(ecosystem_stats["error"])

                # Get weekly download trends
                weekly_stats = await self.fetch_weekly_trends(session, package_name)
                if weekly_stats.get("error"):
                    raise Exception(weekly_stats["error"])

                # Get latest version info
                latest_version = data.get("dist-tags", {}).get("latest")
                if not latest_version or "versions" not in data:
                    raise Exception("No version information found")

                latest_data = data["versions"][latest_version]

                # Prepare document for MongoDB
                current_time = datetime.datetime.now()
                package_doc = {
                    "name": package_name,
                    "description": data.get("description", ""),
                    "link": f"https://www.npmjs.com/package/{package_name}",
                    "dependencies": list(latest_data.get("dependencies", {}).keys()),
                    "downloads": {
                        "total": ecosystem_stats["total_downloads"],
                        "weekly_trends": weekly_stats["weekly_trends"],
                    },
                    "dependent_packages_count": ecosystem_stats["dependent_count"],
                    "latest_version": latest_version,
                    "created_time": current_time,
                    "last_updated": current_time,
                }

                # Store in MongoDB
                self.collection.insert_one(package_doc)
                print(f"Successfully processed and stored package: {package_name}")

        except Exception as e:
            error_msg = f"Error processing {package_name}: {str(e)}"
            print(f"WARNING: {error_msg}")
            self.log_failed_package(package_name, str(e))

    async def process_packages(self):
        """Process all packages from input file."""
        # Read package names
        with open(self.input_file, "r") as f:
            package_names: List[str] = json.load(f)

        print(f"Starting to process {len(package_names)} packages...")

        # Process packages
        async with aiohttp.ClientSession() as session:
            tasks = [
                self.fetch_and_store_package_info(session, name)
                for name in package_names
            ]
            await asyncio.gather(*tasks)

        # Save failed packages log
        self.save_failed_packages_log()

        # Print summary
        total_failed = len(self.failed_packages)
        print(f"\nProcessing complete:")
        print(f"Total packages processed: {len(package_names)}")
        print(f"Failed: {total_failed}")
        print(f"Successful: {len(package_names) - total_failed}")


def main():
    input_file = "data/package_names.json"

    # Create processor and run
    processor = NPMPackageProcessor(input_file)
    asyncio.run(processor.process_packages())


if __name__ == "__main__":
    start_time = time.time()
    main()
    print(f"\nTotal execution time: {time.time() - start_time:.2f} seconds")

import asyncio
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List

import aiohttp
from pymongo import MongoClient


class PackagePeerDependencyUpdater:
    def __init__(self):
        # MongoDB setup
        self.client = MongoClient("mongodb://localhost:27017/")
        self.db = self.client["npm-leaderboard"]
        self.collection = self.db["packages"]

        # NPM registry URL
        self.registry_url = "https://registry.npmjs.org"
        self.semaphore = asyncio.Semaphore(10)  # Limit concurrent requests

        # Setup logging
        self.log_dir = Path("data/logs")
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.failed_updates = []

    async def fetch_peer_dependencies(
        self, session: aiohttp.ClientSession, package_name: str
    ) -> Dict:
        """Fetch peer dependencies for a package from npm registry."""
        try:
            async with self.semaphore:
                async with session.get(
                    f"{self.registry_url}/{package_name}"
                ) as response:
                    if response.status != 200:
                        raise Exception(
                            f"Failed to fetch package info: {response.status}"
                        )

                    data = await response.json()
                    latest_version = data.get("dist-tags", {}).get("latest")

                    if not latest_version or "versions" not in data:
                        raise Exception("No version information found")

                    latest_data = data["versions"][latest_version]
                    return {
                        "peerDependencies": list(
                            latest_data.get("peerDependencies", {}).keys()
                        ),
                        "latest_version": latest_version,
                    }

        except Exception as e:
            raise Exception(f"Error fetching peer dependencies: {str(e)}")

    def log_failed_update(self, package_name: str, error: str):
        """Log failed package updates."""
        self.failed_updates.append(
            {
                "package": package_name,
                "error": error,
                "timestamp": datetime.now().isoformat(),
            }
        )

    def save_failed_updates_log(self):
        """Save failed updates to a log file."""
        if self.failed_updates:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            log_file = self.log_dir / f"failed_peer_deps_updates_{timestamp}.log"

            with open(log_file, "w") as f:
                json.dump(self.failed_updates, f, indent=2)

            print(f"Failed updates log saved to: {log_file}")

    async def update_package(self, session: aiohttp.ClientSession, package: Dict):
        """Update a single package with peer dependencies."""
        try:
            package_name = package["name"]
            peer_deps_info = await self.fetch_peer_dependencies(session, package_name)

            # Update document in MongoDB
            update_result = self.collection.update_one(
                {"name": package_name},
                {
                    "$set": {
                        "peerDependencies": peer_deps_info["peerDependencies"],
                        "last_updated": datetime.now(),
                    }
                },
            )

            if update_result.modified_count > 0:
                print(f"Successfully updated peer dependencies for {package_name}")
            else:
                print(f"No changes made for {package_name}")

        except Exception as e:
            error_msg = f"Error updating {package_name}: {str(e)}"
            print(f"WARNING: {error_msg}")
            self.log_failed_update(package_name, str(e))

    async def update_all_packages(self):
        """Update all packages in the database with peer dependencies."""
        # Get all packages from MongoDB
        packages = list(self.collection.find({}, {"name": 1}))

        print(f"Starting to update {len(packages)} packages with peer dependencies...")

        # Process packages
        async with aiohttp.ClientSession() as session:
            tasks = [self.update_package(session, package) for package in packages]
            await asyncio.gather(*tasks)

        # Save failed updates log
        self.save_failed_updates_log()

        # Print summary
        total_failed = len(self.failed_updates)
        successful = len(packages) - total_failed

        print(f"\nUpdate complete:")
        print(f"Total packages processed: {len(packages)}")
        print(f"Successfully updated: {successful}")
        print(f"Failed: {total_failed}")


def main():
    updater = PackagePeerDependencyUpdater()
    asyncio.run(updater.update_all_packages())


if __name__ == "__main__":
    start_time = time.time()
    main()
    print(f"\nTotal execution time: {time.time() - start_time:.2f} seconds")

import asyncio
import datetime
import json
import time
from pathlib import Path
from typing import Dict, List

import aiohttp


class NPMPackageProcessor:
    def __init__(self, input_file: str, output_file: str):
        self.input_file = input_file
        self.output_file = output_file
        self.registry_url = "https://registry.npmjs.org"
        self.downloads_url = "https://api.npmjs.org/downloads"
        self.semaphore = asyncio.Semaphore(10)  # Limit concurrent requests

    async def fetch_package_info(
        self, session: aiohttp.ClientSession, package_name: str
    ) -> Dict:
        """Fetch basic info and downloads for a single package."""
        try:
            async with self.semaphore:
                # Get package metadata
                async with session.get(
                    f"{self.registry_url}/{package_name}"
                ) as response:
                    if response.status != 200:
                        return self._create_error_entry(
                            package_name,
                            f"Failed to fetch package info: {response.status}",
                        )
                    data = await response.json()

                # Calculate dates for 6-month download period
                end_date = datetime.datetime.now()
                start_date = end_date - datetime.timedelta(days=180)
                date_range = (
                    f"{start_date.strftime('%Y-%m-%d')}:{end_date.strftime('%Y-%m-%d')}"
                )

                # Get download statistics
                downloads_url = (
                    f"{self.downloads_url}/range/{date_range}/{package_name}"
                )
                async with session.get(downloads_url) as response:
                    if response.status != 200:
                        return self._create_error_entry(
                            package_name,
                            f"Failed to fetch download stats: {response.status}",
                        )
                    download_data = await response.json()

                # Get latest version info
                latest_version = data.get("dist-tags", {}).get("latest")
                if not latest_version or "versions" not in data:
                    return self._create_error_entry(
                        package_name, "No version information found"
                    )

                latest_data = data["versions"][latest_version]

                # Calculate total downloads
                total_downloads = sum(
                    day["downloads"] for day in download_data.get("downloads", [])
                )

                return {
                    "name": package_name,
                    "description": data.get("description", ""),
                    "link": f"https://www.npmjs.com/package/{package_name}",
                    "dependencies": list(latest_data.get("dependencies", {}).keys()),
                    "downloads_last_6_months": total_downloads,
                    "latest_version": latest_version,
                    "error": None,
                }

        except Exception as e:
            return self._create_error_entry(package_name, str(e))

    def _create_error_entry(self, package_name: str, error_msg: str) -> Dict:
        """Create an error entry for failed package processing."""
        return {
            "name": package_name,
            "description": "",
            "link": "",
            "dependencies": [],
            "downloads_last_6_months": 0,
            "latest_version": "",
            "error": error_msg,
        }

    async def process_packages(self):
        """Process all packages from input file and save results to output file."""
        # Read package names
        with open(self.input_file, "r") as f:
            package_names: List[str] = json.load(f)

        # Process packages in batches
        async with aiohttp.ClientSession() as session:
            tasks = [self.fetch_package_info(session, name) for name in package_names]
            results = await asyncio.gather(*tasks)

        # Save results
        with open(self.output_file, "w") as f:
            json.dump(results, f, indent=2)

        # Print summary
        successful = sum(1 for r in results if not r.get("error"))
        print(f"\nProcessing complete:")
        print(f"Total packages: {len(results)}")
        print(f"Successful: {successful}")
        print(f"Failed: {len(results) - successful}")
        print(f"Results saved to: {self.output_file}")


def main():
    input_file = "package_names.json"
    output_file = "package_info.json"

    # Create processor and run
    processor = NPMPackageProcessor(input_file, output_file)
    asyncio.run(processor.process_packages())


if __name__ == "__main__":
    start_time = time.time()
    main()
    print(f"\nTotal execution time: {time.time() - start_time:.2f} seconds")

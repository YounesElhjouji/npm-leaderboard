import asyncio
import json
import time
from pathlib import Path
from typing import Dict, List

import aiohttp


class TopPackagesFetcher:
    def __init__(self):
        self.base_url = (
            "https://packages.ecosyste.ms/api/v1/registries/npmjs.org/package_names"
        )
        self.packages_per_page = 1000
        self.total_pages = 10  # To get 10k packages
        self.output_file = "data/package_names.json"
        self.semaphore = asyncio.Semaphore(5)  # Limit concurrent requests

    async def fetch_page(self, session: aiohttp.ClientSession, page: int) -> List[str]:
        """Fetch a single page of package names."""
        try:
            async with self.semaphore:
                params = {
                    "per_page": self.packages_per_page,
                    "sort": "downloads",
                    "page": page,
                }

                async with session.get(self.base_url, params=params) as response:
                    if response.status != 200:
                        print(f"Error fetching page {page}: Status {response.status}")
                        return []

                    data = await response.json()
                    print(f"Successfully fetched page {page}/{self.total_pages}")
                    return data

        except Exception as e:
            print(f"Error fetching page {page}: {str(e)}")
            return []

    async def fetch_all_packages(self) -> List[str]:
        """Fetch all pages of package names."""
        async with aiohttp.ClientSession() as session:
            tasks = [
                self.fetch_page(session, page)
                for page in range(1, self.total_pages + 1)
            ]
            results = await asyncio.gather(*tasks)

        # Flatten results from all pages
        all_packages = []
        for page_results in results:
            if page_results:  # Only add if we got valid results
                all_packages.extend(page_results)

        return all_packages

    def save_packages(self, packages: List[str]):
        """Save packages to JSON file."""
        # Create directory if it doesn't exist
        output_path = Path(self.output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Save to file
        with open(output_path, "w") as f:
            json.dump(packages, f, indent=2)

        print(f"\nSaved {len(packages)} packages to {self.output_file}")


async def main():
    start_time = time.time()

    fetcher = TopPackagesFetcher()
    print("Fetching top packages by downloads...")

    packages = await fetcher.fetch_all_packages()

    if packages:
        fetcher.save_packages(packages)
        print(f"\nTotal packages fetched: {len(packages)}")
    else:
        print("\nFailed to fetch packages")

    print(f"Total execution time: {time.time() - start_time:.2f} seconds")


if __name__ == "__main__":
    asyncio.run(main())

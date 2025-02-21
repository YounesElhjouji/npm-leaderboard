import argparse
import asyncio
import json
import time
from pathlib import Path
from typing import List

import aiohttp


class TopPackagesFetcher:
    def __init__(self, skip: int = 0, output_file: str = "data/package_names.json"):
        self.base_url = (
            "https://packages.ecosyste.ms/api/v1/registries/npmjs.org/package_names"
        )
        self.packages_per_page = 1000
        self.total_pages = 10  # To get 10k packages
        self.output_file = output_file
        self.skip = skip
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
        """
        Fetch all pages of package names starting from a computed start page
        based on the 'skip' parameter. Partial pages are not trimmed.
        """
        # Compute the starting page based on skip (ignore any partial skip)
        start_page = (self.skip // self.packages_per_page) + 1
        print(f"Skipping pages 1 to {start_page - 1}. Starting at page {start_page}.")

        pages_to_fetch = range(start_page, start_page + self.total_pages + 1)
        async with aiohttp.ClientSession() as session:
            tasks = [self.fetch_page(session, page) for page in pages_to_fetch]
            results = await asyncio.gather(*tasks)

        # Flatten the results from all pages
        all_packages = []
        for page_results in results:
            if page_results:
                all_packages.extend(page_results)
        return all_packages

    def save_packages(self, packages: List[str]):
        """Save packages to JSON file."""
        output_path = Path(self.output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(packages, f, indent=2)
        print(f"\nSaved {len(packages)} packages to {self.output_file}")


async def main():
    parser = argparse.ArgumentParser(description="Fetch top npm packages by downloads.")
    parser.add_argument(
        "--skip",
        type=int,
        default=0,
        help="Number of packages to skip (for resuming a previous run)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/package_names.json",
        help="File location to store the package data",
    )
    args = parser.parse_args()

    start_time = time.time()
    fetcher = TopPackagesFetcher(skip=args.skip, output_file=args.output)
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

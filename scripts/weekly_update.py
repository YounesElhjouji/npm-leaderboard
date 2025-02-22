#!/usr/bin/env python3
import asyncio
import time
from datetime import datetime

from .fetchPackagesWithInfo import TopPackagesFetcher
from .processPackagesInfo import NPMPackageProcessor
from .syncMetadata import SyncMetadata  # Import the sync metadata module
from .updateExistingPackages import NPMPackageUpdater


async def main():
    overall_start = time.time()

    # Fetch packages
    step_start = datetime.now()
    print(f"Starting fetch_packages at {step_start.isoformat()}")
    fetcher = TopPackagesFetcher(
        skip=0, output_file="data/package_names_ephemeral.json"
    )
    packages = await fetcher.fetch_all_packages()
    if packages:
        fetcher.save_packages(packages)
        print(f"Total packages fetched: {len(packages)}")
    else:
        print("Failed to fetch packages")
        return
    step_end = datetime.now()
    print(
        f"Completed fetch_packages at {step_end.isoformat()} (duration: {(step_end - step_start).total_seconds():.2f}s)"
    )

    # Process new packages
    step_start = datetime.now()
    print(f"Starting process_new_packages at {step_start.isoformat()}")
    processor = NPMPackageProcessor(
        input_file="data/package_names_ephemeral.json", batch_size=100
    )
    await processor.process_packages()
    step_end = datetime.now()
    print(
        f"Completed process_new_packages at {step_end.isoformat()} (duration: {(step_end - step_start).total_seconds():.2f}s)"
    )

    # Update existing packages
    step_start = datetime.now()
    print(f"Starting update_existing_packages at {step_start.isoformat()}")
    updater = NPMPackageUpdater()
    await updater.update_all_packages()
    step_end = datetime.now()
    print(
        f"Completed update_existing_packages at {step_end.isoformat()} (duration: {(step_end - step_start).total_seconds():.2f}s)"
    )

    # Update the last sync date in the database
    sync = SyncMetadata()
    sync.update_last_sync()

    overall_elapsed = time.time() - overall_start
    print(f"Weekly update complete in {overall_elapsed:.2f} seconds.")


if __name__ == "__main__":
    asyncio.run(main())

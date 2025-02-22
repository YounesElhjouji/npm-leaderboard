#!/usr/bin/env python3
import subprocess
import sys
import time


def run_fetch_packages():
    print("Fetching top 20k npm packages...")
    result = subprocess.run(
        [
            "python",
            "fetchPackagesWithInfo.py",
            "--skip",
            "0",
            "--output",
            "data/package_names_ephemeral.json",
        ],
        cwd="scripts",  # Change directory to 'scripts' before executing the command
    )
    if result.returncode != 0:
        print("Failed to fetch top packages")
        sys.exit(1)


def run_process_new_packages():
    print("Processing newly added packages...")
    result = subprocess.run(
        [
            "python",
            "processPackagesInfo.py",
            "--input",
            "data/package_names_ephemeral.json",
        ],
        cwd="scripts",
    )
    if result.returncode != 0:
        print("Failed to process new packages")
        sys.exit(1)


def run_update_existing_packages():
    print("Updating existing packages...")
    result = subprocess.run(["python", "updateExistingPackages.py"], cwd="scripts")
    if result.returncode != 0:
        print("Failed to update existing packages")
        sys.exit(1)


def main():
    start_time = time.time()
    run_fetch_packages()
    run_update_existing_packages()
    run_process_new_packages()
    elapsed = time.time() - start_time
    print(f"Weekly update complete in {elapsed:.2f} seconds.")


if __name__ == "__main__":
    main()

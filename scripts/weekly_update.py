#!/usr/bin/env python3
import logging
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

# Configure logging
log_dir = Path("scripts/logs")
log_dir.mkdir(exist_ok=True)
log_file = log_dir / f"update_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.FileHandler(log_file), logging.StreamHandler()],
)
logger = logging.getLogger(__name__)


def run_command(command: list[str], timeout: int = 7200) -> bool:
    """
    Run a command with timeout and proper error handling.
    Default timeout of 2 hours per command.
    Returns True if successful, False otherwise.
    """
    command_name = command[1] if len(command) > 1 else command[0]
    start_time = time.time()

    try:
        logger.info(f"Starting {command_name}...")
        process = subprocess.Popen(
            command,
            cwd="scripts",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
        )

        # Stream output in real-time while checking for timeout
        while process.poll() is None:
            # Check stdout
            if process.stdout:
                line = process.stdout.readline()
                if line:
                    logger.info(line.rstrip())

            # Check stderr
            if process.stderr:
                line = process.stderr.readline()
                if line:
                    logger.error(line.rstrip())

            # Check timeout
            if time.time() - start_time > timeout:
                process.terminate()
                process.wait(timeout=30)  # Give it 30 seconds to terminate gracefully
                if process.poll() is None:
                    process.kill()  # Force kill if still running
                logger.error(f"{command_name} timed out after {timeout} seconds")
                return False

            time.sleep(0.1)  # Prevent CPU spinning

        # Get final output
        stdout, stderr = process.communicate()
        if stdout:
            logger.info(stdout)
        if stderr:
            logger.error(stderr)

        if process.returncode != 0:
            logger.error(
                f"Failed to run {command_name}: Exit code {process.returncode}"
            )
            return False

        logger.info(f"Successfully completed {command_name}")
        return True

    except Exception as e:
        logger.error(f"Error running {command_name}: {str(e)}")
        return False


def run_fetch_packages() -> bool:
    return run_command(
        [
            "python",
            "fetchPackagesWithInfo.py",
            "--skip",
            "0",
            "--output",
            "data/package_names_ephemeral.json",
        ],
        timeout=5400,
    )  # 1.5 hours timeout


def run_process_new_packages() -> bool:
    return run_command(
        [
            "python",
            "processPackagesInfo.py",
            "--input",
            "data/package_names_ephemeral.json",
        ],
        timeout=5400,
    )  # 1.5 hours timeout


def run_update_existing_packages() -> bool:
    return run_command(
        ["python", "updateExistingPackages.py"], timeout=5400
    )  # 1.5 hours timeout


def main():
    start_time = time.time()
    checkpoint_file = Path("scripts/update_checkpoint.txt")

    # Create a checkpoint file to track progress
    checkpoint_file.write_text(f"Started update at {datetime.now().isoformat()}\n")

    # Run each step and check for failures
    steps = [
        ("fetch_packages", run_fetch_packages),
        ("update_existing", run_update_existing_packages),
        ("process_new", run_process_new_packages),
    ]

    for step_name, step_func in steps:
        step_start = datetime.now()
        with open(checkpoint_file, "a") as f:
            f.write(f"Starting {step_name} at {step_start.isoformat()}\n")

        if not step_func():
            logger.error(f"Step {step_name} failed. Exiting.")
            with open(checkpoint_file, "a") as f:
                f.write(f"Failed {step_name} at {datetime.now().isoformat()}\n")
            sys.exit(1)

        step_end = datetime.now()
        step_duration = (step_end - step_start).total_seconds()
        with open(checkpoint_file, "a") as f:
            f.write(
                f"Completed {step_name} at {step_end.isoformat()} (duration: {step_duration:.2f}s)\n"
            )

    elapsed = time.time() - start_time
    final_message = f"Weekly update complete in {elapsed:.2f} seconds."
    logger.info(final_message)
    with open(checkpoint_file, "a") as f:
        f.write(f"{final_message}\n")


if __name__ == "__main__":
    main()

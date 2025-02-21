import json
from pathlib import Path


def load_json_list(file_path: str) -> list:
    with open(file_path, "r") as f:
        return json.load(f)


def load_txt_list(file_path: str) -> list:
    with open(file_path, "r") as f:
        # Remove any extra whitespace/newlines
        return [line.strip() for line in f if line.strip()]


def merge_unique_names(*lists) -> list:
    # Use a set for uniqueness
    unique_names = set()
    for name_list in lists:
        unique_names.update(name_list)
    return list(unique_names)


def main():
    # Define file paths
    json_file1 = "data/package_names_10k.json"
    json_file2 = "data/package_names_10-20k.json"
    txt_file = "data/namesOnly.txt"
    output_file = "data/merged_package_names.json"

    # Load names from each file
    names1 = load_json_list(json_file1)
    names2 = load_json_list(json_file2)
    names3 = load_txt_list(txt_file)

    # Merge and deduplicate
    merged_names = merge_unique_names(names1, names2, names3)

    # Save the merged list to a JSON file
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(merged_names, f, indent=2)

    print(f"Merged {len(merged_names)} unique package names saved to {output_file}")


if __name__ == "__main__":
    main()

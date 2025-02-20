import json


def topNamesWithSystems(topNameFile: str, systemsFile: str):
    with open(topNameFile, "r") as file:
        topNames = file.read().splitlines()
    with open(systemsFile, "r") as file:
        systemsNames = json.load(file)
    print(topNames[:10])
    print(systemsNames[:10])

    notFound = []
    for i, name in enumerate(topNames):
        if name not in systemsNames:
            notFound.append((name, i + 1))
    print(f"{len(notFound)} packages are missing")
    print(f"Prominent examples: {notFound[:10]}")


if __name__ == "__main__":
    topNamesWithSystems("data/namesOnly.txt", "data/package_names_10k.json")

import json

import requests

response = requests.get(
    "https://packages.ecosyste.ms/api/v1/registries/npmjs.org/package_names",
    params={"per_page": 10, "sort": "downloads"},
)

with open("package_names.json", "w") as f:
    json.dump(response.json(), f)

print(response.status_code)

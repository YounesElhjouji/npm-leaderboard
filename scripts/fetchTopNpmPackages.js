const axios = require("axios");
const fs = require("fs").promises;

async function fetchTopNpmPackages() {
  try {
    const allPackages = [];
    let offset = 0;
    const batchSize = 100; // Reduced batch size
    const targetCount = 10000;
    const maxRetries = 3;

    console.log("Fetching top NPM packages...");

    // First, get a list of all package names
    while (allPackages.length < targetCount) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second between search requests

        const response = await axios.get(
          `https://registry.npmjs.org/-/v1/search?text=popularity:>1000&size=${batchSize}&from=${offset}`,
        );

        const packages = response.data.objects;
        if (packages.length === 0) break;

        const processedPackages = packages.map((pkg) => ({
          name: pkg.package.name,
          description: pkg.package.description,
          version: pkg.package.version,
          score: pkg.score,
          downloads: 0,
        }));

        allPackages.push(...processedPackages);
        offset += batchSize;

        console.log(`Fetched ${allPackages.length} packages...`);
      } catch (error) {
        if (error.response && error.response.status === 429) {
          console.log("Rate limited, waiting 60 seconds...");
          await new Promise((resolve) => setTimeout(resolve, 60000));
          continue;
        }
        throw error;
      }
    }

    // Process downloads in smaller chunks with retries
    console.log("Fetching download statistics...");
    for (let i = 0; i < allPackages.length; i += 10) {
      // Process 10 packages at a time
      const chunk = allPackages.slice(i, i + 10);
      let retries = 0;

      while (retries < maxRetries) {
        try {
          await Promise.all(
            chunk.map(async (pkg) => {
              await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay between each package
              const statsResponse = await axios.get(
                `https://api.npmjs.org/downloads/point/last-month/${pkg.name}`,
              );
              pkg.downloads = statsResponse.data.downloads;
            }),
          );
          break; // Successful, move to next chunk
        } catch (error) {
          retries++;
          if (error.response && error.response.status === 429) {
            console.log(
              `Rate limited on chunk ${i}, waiting ${30 * retries} seconds...`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, 30000 * retries),
            );
          } else {
            console.error(`Error processing chunk ${i}:`, error.message);
            if (retries === maxRetries) break;
          }
        }
      }

      if (i % 50 === 0) {
        console.log(`Processed ${i} of ${allPackages.length} packages...`);
        // Save intermediate results
        await fs.writeFile(
          "top_npm_packages_partial.json",
          JSON.stringify(allPackages.slice(0, i + 10), null, 2),
        );
      }
    }

    // Sort by downloads and take top packages
    const topPackages = allPackages
      .filter((pkg) => pkg.downloads > 0) // Remove any packages that failed to get downloads
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, targetCount);

    // Save final results
    await fs.writeFile(
      "top_npm_packages.json",
      JSON.stringify(topPackages, null, 2),
    );

    // Print summary of top 10
    console.log("\nTop 10 most downloaded packages:");
    topPackages.slice(0, 10).forEach((pkg, index) => {
      console.log(
        `${index + 1}. ${pkg.name}: ${pkg.downloads.toLocaleString()} downloads/month`,
      );
    });

    return topPackages;
  } catch (error) {
    console.error("Error fetching package data:", error.message);
    throw error;
  }
}

// Execute the function
fetchTopNpmPackages();

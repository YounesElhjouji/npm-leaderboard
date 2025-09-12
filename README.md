# NPM Leaderboard

A web application that ranks and tracks the most popular npm packages based on downloads, fastest-growing trends, and the number of dependents.

## 🚀 Features

- **Sort npm packages** by:
  - 📈 **Most Downloaded** (Total downloads)
  - 🚀 **Trending** (Average weekly percentage growth)
  - 🔗 **Most Dependents** (Repos that rely on it)
- **Filter by dependencies**: Search for packages that depend on a specific package (e.g., `react`).
- **🧠 AI-Powered Smart Search**: Find packages using natural language. Includes Redis-backed caching, rate-limiting, and abuse prevention.
- **Dark Mode by Default** 🌙
- **Fast and lightweight**: Built with **Next.js**, **MongoDB**, and **Redis**.

## 🧠 AI Smart Search

NPM Leaderboard includes an optional Smart Search feature that uses the Perplexity API to understand natural language queries. When you search, the application:

1.  Sends your query to the Perplexity Sonar model to get a list of relevant npm package names.
2.  Looks up these packages in our curated database of the top ~20k packages.
3.  For any real packages not found in our database, it verifies their existence with the npm registry and displays them in a separate "Smaller packages" section.

To ensure a smooth, cost-effective, and secure experience, this feature is protected by several **Redis-backed guardrails**, including caching, rate limiting (per-user and global), and a short-term cooldown to prevent spam.

## 📊 Data Collection & Weekly Sync

Our application uses an automated data collection pipeline to keep the leaderboard current. Every week, a scheduled GitHub Action triggers a series of scripts that:

- **Fetch the latest package metadata** from the npm registry and ecosyste.ms.
- **Collect download statistics**, including weekly trends and total downloads.
- **Process the top 20,000 most popular packages** to generate the rankings.
- **Update package details** in our MongoDB database, ensuring that the leaderboard reflects the most recent data.

This weekly sync ensures that the leaderboard remains accurate and up-to-date without manual intervention.

## 🛠️ Setup & Installation

### **Prerequisites**

- Node.js (`>=16.x`)
- MongoDB (running locally or via cloud like MongoDB Atlas)
- Redis (running locally or via cloud like Upstash)

### **1️⃣ Clone the repository**

```sh
git clone https://github.com/YOUR_GITHUB_USERNAME/npm-leaderboard.git
cd npm-leaderboard
```

### **2️⃣ Install dependencies**

```sh
npm install
```

### **3️⃣ Set up environment variables**

Create a `.env.local` file in the root directory:

```sh
# Required for database
MONGODB_URI=mongodb://localhost:27017/npm-leaderboard

# Required for AI Smart Search
PPLX_API_KEY=your_perplexity_api_key_here
REDIS_URL=redis://localhost:6379
```

- **`MONGODB_URI`**: Your MongoDB connection string.
- **`PPLX_API_KEY`**: Your API key from Perplexity AI. This is required to enable the AI-powered Smart Search feature. You can get a key from the [Perplexity AI Platform](https://www.perplexity.ai/platform).
- **`REDIS_URL`**: Your Redis connection string. This is required for Smart Search caching, rate-limiting, and cooldowns.

#### Advanced Configuration (Optional)

You can further customize the Smart Search guardrails by setting these optional environment variables:

| Variable                      | Default | Description                                                        |
| ----------------------------- | ------- | ------------------------------------------------------------------ |
| `SMART_SEARCH_CACHE_TTL_SEC`  | `43200` | Cache duration for AI responses (in seconds). Default is 12 hours. |
| `SMART_SEARCH_COOLDOWN_SEC`   | `3`     | Minimum time (in seconds) between requests from the same user.     |
| `SMART_SEARCH_HOURLY_LIMIT`   | `5`     | Max number of requests per user per hour.                          |
| `SMART_SEARCH_CIRCUIT_CAP`    | `200`   | Global daily cap on total requests to prevent abuse.               |
| `SMART_SEARCH_STRICT_LIMITER` | `false` | If `true`, denies requests if Redis is unavailable.                |
| `SMART_SEARCH_AUDIT_ENABLED`  | `true`  | Enables logging of smart search events to a Redis stream.          |

### **4️⃣ Run the development server**

```sh
npm run dev
```

Then open [http://localhost:4200](http://localhost:4200) in your browser.

## 📝 License

This project is licensed under the MIT License.

---

## 📧 Contact

For any inquiries or feature requests, feel free to reach out!

    younes.elhjouji@gmail.com

---

### ✅ **What's Next?**

That's up to you! You request it, I work on it.

```

```

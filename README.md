# NPM Leaderboard

A web application that ranks and tracks the most popular npm packages based on downloads, fastest-growing trends, and the number of dependents.

## 🚀 Features

- **Sort npm packages** by:
  - 📈 **Most Downloaded** (Total downloads)
  - 🚀 **Trending** (Average weekly percentage growth)
  - 🔗 **Most Dependents** (Repos that rely on it)
- **Filter by dependencies**: Search for packages that depend on a specific package (e.g., `react`).
- **Dark Mode by Default** 🌙
- **Fast and lightweight**: Built with **Next.js** and **MongoDB**.

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
MONGODB_URI=mongodb://localhost:27017/
```

(Replace with your actual MongoDB connection string if hosted remotely.)

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

---

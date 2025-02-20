const Header = () => {
  return (
    <header className="bg-[#1e1e1e] text-[#d4d4d4] py-4 shadow-md border-b border-gray-700">
      <div className="container mx-auto px-4 flex flex-col md:flex-row items-start md:justify-between">
        {/* Title and Description (always left aligned) */}
        <div className="w-full text-left">
          <h1 className="text-3xl font-bold text-[#569CD6]">NPM Leaderboard</h1>
          <p className="mt-1 text-md">
            Explore the most popular npm packages by downloads, growth, and
            dependents.
          </p>
        </div>

        {/* Additional Details (always right aligned) */}
        <div className="w-full mt-4 md:mt-0 text-right">
          <p className="mb-1">
            Last updated: <span className="font-semibold">16 Feb 2025</span>
          </p>
          <p>
            <a
              href="https://younes.elhjouji.com"
              className="text-[#569CD6] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              My Website
            </a>
          </p>
          <p>
            <a
              href="https://github.com/USERNAME/REPO"
              className="text-[#569CD6] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub Repo
            </a>
          </p>
        </div>
      </div>
    </header>
  );
};

export default Header;

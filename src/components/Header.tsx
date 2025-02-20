const Header = () => {
  return (
    <header className="bg-[#1e1e1e] text-[#d4d4d4] py-4 shadow-md border-b border-gray-700">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold text-[#569CD6]">NPM Leaderboard</h1>
        <p className="mt-1 text-md">
          Explore the most popular npm packages by downloads, growth, and
          dependents.
        </p>
      </div>
    </header>
  );
};

export default Header;

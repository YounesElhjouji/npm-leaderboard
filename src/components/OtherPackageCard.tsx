import posthog from "posthog-js";

interface OtherItem {
  name: string;
  description: string;
  link: string;
}

interface OtherPackageCardProps {
  item: OtherItem;
}

const OtherPackageCard = ({ item }: OtherPackageCardProps) => {
  const onClick = () => {
    posthog.capture("external_link_click_other", {
      package: item.name,
      url: item.link,
    });
  };

  return (
    <div className="w-full rounded border border-gray-700 bg-[#282828] p-4 shadow-sm transition hover:shadow-md">
      <h4 className="mb-1 text-lg font-semibold">
        <a
          href={`https://www.npmjs.com/package/${item.name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="break-words text-[#7fa3cc] hover:underline"
          onClick={onClick}
        >
          {item.name}
        </a>
      </h4>
      <p className="text-sm text-gray-400">
        {item.description || "No description provided."}
      </p>
    </div>
  );
};

export default OtherPackageCard;

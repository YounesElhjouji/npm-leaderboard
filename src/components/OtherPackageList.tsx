import OtherPackageCard from "./OtherPackageCard";

interface OtherItem {
  name: string;
  description: string;
  link: string;
}

interface OtherPackageListProps {
  items: OtherItem[];
}

const OtherPackageList = ({ items }: OtherPackageListProps) => {
  return (
    <div className="grid grid-cols-1 gap-3">
      {items.map((item) => (
        <OtherPackageCard key={item.name} item={item} />
      ))}
    </div>
  );
};

export default OtherPackageList;

"use client";

import { Tabs } from "@/components/ui/Tabs";

const CATEGORIES = [
  { label: "All", value: "all" },
  { label: "Dairy", value: "dairy" },
  { label: "Produce", value: "produce" },
  { label: "Meat", value: "meat" },
  { label: "Beverage", value: "beverage" },
  { label: "Condiment", value: "condiment" },
  { label: "Leftover", value: "leftover" },
  { label: "Other", value: "other" },
];

interface CategoryFilterProps {
  activeCategory: string;
  onChange: (category: string) => void;
}

export function CategoryFilter({
  activeCategory,
  onChange,
}: CategoryFilterProps) {
  return <Tabs tabs={CATEGORIES} activeTab={activeCategory} onChange={onChange} />;
}

import { StyleSheet, Text, View } from "react-native";
import { Category, ChecklistState, PrepItem } from "@cafe-listo/shared";
import { PrepItemRow } from "./PrepItemRow";

interface Props {
  category: Category;
  items: PrepItem[];
  checklistState: ChecklistState;
  onToggle: (id: string) => void;
}

export function CategorySection({
  category,
  items,
  checklistState,
  onToggle,
}: Props) {
  const checkedCount = items.filter((i) => checklistState[i.id]).length;

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.label}>
          {category.emoji} {category.label}
        </Text>
        <Text style={styles.count}>
          {checkedCount}/{items.length}
        </Text>
      </View>
      {items.map((item) => (
        <PrepItemRow
          key={item.id}
          item={item}
          checked={checklistState[item.id]}
          onToggle={() => onToggle(item.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#f5f5f5",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  label: {
    fontSize: 17,
    fontWeight: "700",
  },
  count: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
});

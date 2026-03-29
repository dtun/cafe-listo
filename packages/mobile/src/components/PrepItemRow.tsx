import { Pressable, StyleSheet, Text, View } from "react-native";
import { PrepItem } from "@cafe-listo/shared";

interface Props {
  item: PrepItem;
  checked: boolean;
  onToggle: () => void;
}

export function PrepItemRow({ item, checked, onToggle }: Props) {
  return (
    <Pressable
      testID={`prep-item-${item.id}`}
      style={styles.row}
      onPress={onToggle}
    >
      <Text testID={`checkbox-${item.id}`} style={styles.checkbox}>
        {checked ? "☑" : "☐"}
      </Text>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.name, checked && styles.checked]}>
            {item.name}
          </Text>
          {item.essential && (
            <Text testID={`badge-${item.id}`} style={styles.badge}>
              Essential
            </Text>
          )}
        </View>
        <Text style={styles.quantity}>{item.quantity}</Text>
        {item.regionNote && (
          <Text testID={`note-${item.id}`} style={styles.regionNote}>
            {item.regionNote}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  checkbox: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: "500",
    flexShrink: 1,
  },
  checked: {
    textDecorationLine: "line-through",
    color: "#999",
  },
  badge: {
    fontSize: 11,
    fontWeight: "600",
    color: "#d32f2f",
    backgroundColor: "#ffebee",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  quantity: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  regionNote: {
    fontSize: 12,
    color: "#888",
    fontStyle: "italic",
    marginTop: 4,
  },
});

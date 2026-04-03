import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CATEGORIES, getItemsByCategory } from "@cafe-listo/shared";
import { useChecklist } from "../hooks/useChecklist";
import { CategorySection } from "../components/CategorySection";

export function ChecklistScreen() {
  const { state, toggle, progress, loading } = useChecklist();

  if (loading) {
    return (
      <View style={styles.loading} testID="loading-indicator">
        <ActivityIndicator size="large" color="#1b5e20" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} testID="checklist-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Cafe Listo</Text>
        <Text style={styles.subtitle}>Mesa, AZ Prep Box</Text>
        <Text style={styles.progress}>
          {progress.checked} / {progress.total} items ready
        </Text>
      </View>
      {CATEGORIES.map((category) => (
        <CategorySection
          key={category.id}
          category={category}
          items={getItemsByCategory(category.id)}
          checklistState={state}
          onToggle={toggle}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: "#1b5e20",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#fff",
  },
  subtitle: {
    fontSize: 14,
    color: "#c8e6c9",
    marginTop: 4,
  },
  progress: {
    fontSize: 16,
    color: "#fff",
    marginTop: 8,
    fontWeight: "600",
  },
});

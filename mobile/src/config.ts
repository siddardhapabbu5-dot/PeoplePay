import Constants from "expo-constants";
import { Platform } from "react-native";

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  extra?.apiUrl ||
  (Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000");

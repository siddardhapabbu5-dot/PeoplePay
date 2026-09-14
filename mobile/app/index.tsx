import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { getToken } from "../src/services/api";

export default function Index() {
  const [to, setTo] = useState<string | null>(null);
  useEffect(() => {
    getToken().then((t) => setTo(t ? "/(tabs)" : "/login"));
  }, []);
  if (!to) return null;
  return <Redirect href={to as any} />;
}

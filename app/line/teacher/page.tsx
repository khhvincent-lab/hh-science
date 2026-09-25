import type { Metadata } from "next";
import TeacherHandoff from "./teacher-handoff";
export const metadata: Metadata = {
  title: "詢問老師｜解題實驗室",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function TeacherPage() { return <TeacherHandoff />; }

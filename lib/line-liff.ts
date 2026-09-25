export const TEACHER_LIFF_ID = "2011732473-Xuuu1jD6";
export const TEACHER_LIFF_URL = `https://liff.line.me/${TEACHER_LIFF_ID}`;
export type LineMessage = { type: "text"; text: string } | { type: "image"; originalContentUrl: string; previewImageUrl: string };
export type TeacherLiff = {
  init(config: { liffId: string }): Promise<void>;
  isInClient(): boolean;
  getIDToken(): string | null;
  getContext(): { type: string; scope?: string[] } | null;
  sendMessages(messages: LineMessage[]): Promise<void>;
  permission: { getGrantedAll(): Promise<string[]> };
  closeWindow(): void;
};
declare global { interface Window { liff?: TeacherLiff } }

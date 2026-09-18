export type AddItem = (formData: FormData) => Promise<{ error?: string; success?: boolean }>;

export async function confirmScannedItem(addItem: AddItem, name: string) {
  const formData = new FormData();
  formData.set("name", name);
  return addItem(formData);
}

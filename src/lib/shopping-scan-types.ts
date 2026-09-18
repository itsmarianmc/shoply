export interface ShoppingScanItem {
  name: string;
}

export interface ShoppingScanResult {
  total_detected_lines: number;
  successfully_parsed_count: number;
  unreadable_count: number;
  items: ShoppingScanItem[];
}

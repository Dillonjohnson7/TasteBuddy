export type FridgeItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  confidence: number;
  is_present: boolean;
  first_seen: string;
  last_seen: string;
  image_url: string | null;
  session_id: string | null;
};

export type ScanLogEntry = {
  id: string;
  created_at: string;
  frame_count: number;
  items_detected: number;
  raw_response: unknown;
  session_id: string | null;
};

export type Session = {
  id: string;
  code: string;
  created_at: string;
  expires_at: string;
};

export type Database = {
  public: {
    Tables: {
      fridge_items: {
        Row: FridgeItem;
        Insert: Partial<FridgeItem> & { name: string };
        Update: Partial<FridgeItem>;
        Relationships: [];
      };
      scan_log: {
        Row: ScanLogEntry;
        Insert: Partial<ScanLogEntry>;
        Update: Partial<ScanLogEntry>;
        Relationships: [];
      };
      sessions: {
        Row: Session;
        Insert: Partial<Session> & { code: string };
        Update: Partial<Session>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  manga_sanctuary: {
    Tables: {
      artists: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      authors: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      chapter_pages: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          image_url: string
          page_number: number
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          image_url: string
          page_number: number
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          image_url?: string
          page_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "chapter_pages_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          chapter_number: number
          chapter_title: string | null
          external_url: string | null
          id: string
          manga_id: string
          pages: Json | null
          release_date: string | null
          stitch_status: string
          strip_url: string | null
          volume_number: number | null
          volume_title: string | null
        }
        Insert: {
          chapter_number: number
          chapter_title?: string | null
          external_url?: string | null
          id?: string
          manga_id: string
          pages?: Json | null
          release_date?: string | null
          stitch_status?: string
          strip_url?: string | null
          volume_number?: number | null
          volume_title?: string | null
        }
        Update: {
          chapter_number?: number
          chapter_title?: string | null
          external_url?: string | null
          id?: string
          manga_id?: string
          pages?: Json | null
          release_date?: string | null
          stitch_status?: string
          strip_url?: string | null
          volume_number?: number | null
          volume_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_manga_id_fkey"
            columns: ["manga_id"]
            isOneToOne: false
            referencedRelation: "manga"
            referencedColumns: ["id"]
          },
        ]
      }
      genres: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      list_items: {
        Row: {
          added_at: string
          id: string
          list_id: string
          manga_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          list_id: string
          manga_id: string
        }
        Update: {
          added_at?: string
          id?: string
          list_id?: string
          manga_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_items_manga_id_fkey"
            columns: ["manga_id"]
            isOneToOne: false
            referencedRelation: "manga"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      manga: {
        Row: {
          alt_titles: string[] | null
          artist_id: string | null
          author_id: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_approved: boolean
          language: string
          manga_type: Database["manga_sanctuary"]["Enums"]["manga_type"]
          status: string
          submitted_by: string | null
          title: string
        }
        Insert: {
          alt_titles?: string[] | null
          artist_id?: string | null
          author_id?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_approved?: boolean
          language?: string
          manga_type?: Database["manga_sanctuary"]["Enums"]["manga_type"]
          status?: string
          submitted_by?: string | null
          title: string
        }
        Update: {
          alt_titles?: string[] | null
          artist_id?: string | null
          author_id?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_approved?: boolean
          language?: string
          manga_type?: Database["manga_sanctuary"]["Enums"]["manga_type"]
          status?: string
          submitted_by?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "manga_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manga_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
        ]
      }
      manga_genres: {
        Row: {
          genre_id: string
          manga_id: string
        }
        Insert: {
          genre_id: string
          manga_id: string
        }
        Update: {
          genre_id?: string
          manga_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manga_genres_genre_id_fkey"
            columns: ["genre_id"]
            isOneToOne: false
            referencedRelation: "genres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manga_genres_manga_id_fkey"
            columns: ["manga_id"]
            isOneToOne: false
            referencedRelation: "manga"
            referencedColumns: ["id"]
          },
        ]
      }
      manga_tags: {
        Row: {
          manga_id: string
          tag_id: string
        }
        Insert: {
          manga_id: string
          tag_id: string
        }
        Update: {
          manga_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manga_tags_manga_id_fkey"
            columns: ["manga_id"]
            isOneToOne: false
            referencedRelation: "manga"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manga_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          username?: string | null
        }
        Relationships: []
      }
      ratings: {
        Row: {
          id: string
          manga_id: string
          rating: number
          user_id: string
        }
        Insert: {
          id?: string
          manga_id: string
          rating: number
          user_id: string
        }
        Update: {
          id?: string
          manga_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_manga_id_fkey"
            columns: ["manga_id"]
            isOneToOne: false
            referencedRelation: "manga"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_progress: {
        Row: {
          id: string
          last_chapter_read: number
          last_page_read: number | null
          manga_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          last_chapter_read?: number
          last_page_read?: number | null
          manga_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          last_chapter_read?: number
          last_page_read?: number | null
          manga_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_progress_manga_id_fkey"
            columns: ["manga_id"]
            isOneToOne: false
            referencedRelation: "manga"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          created_at: string
          id: string
          manga_id: string
          rating: number
          review_text: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          manga_id: string
          rating: number
          review_text?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          manga_id?: string
          rating?: number
          review_text?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_manga_id_fkey"
            columns: ["manga_id"]
            isOneToOne: false
            referencedRelation: "manga"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["manga_sanctuary"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["manga_sanctuary"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["manga_sanctuary"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["manga_sanctuary"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      manga_type: "Manga" | "Manhwa" | "Manhua" | "Webtoon"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "manga_sanctuary">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  manga_sanctuary: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      manga_type: ["Manga", "Manhwa", "Manhua", "Webtoon"],
    },
  },
} as const

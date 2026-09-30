
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "appeals": {
                  Row: {
                    "created_at": string,"decision_id": string,"due_by": string,"id": string,"outcome": string | null,"resolved_at": string | null,"reviewer_id": string | null,"statement": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"decision_id": string,"due_by"?: string,"id"?: string,"outcome"?: string | null,"resolved_at"?: string | null,"reviewer_id"?: string | null,"statement": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"decision_id"?: string,"due_by"?: string,"id"?: string,"outcome"?: string | null,"resolved_at"?: string | null,"reviewer_id"?: string | null,"statement"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appeals_decision_id_fkey"
      columns: ["decision_id"]
isOneToOne: false
      referencedRelation: "moderation_decisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appeals_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appeals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string
                  }
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"coin_products": {
                  Row: {
                    "active": boolean,"coins": number,"currency": string,"id": string,"price_cents": number,"sku": string
                  }
                  Insert: {
                    "active"?: boolean,"coins": number,"currency"?: string,"id"?: string,"price_cents": number,"sku": string
                  }
                  Update: {
                    "active"?: boolean,"coins"?: number,"currency"?: string,"id"?: string,"price_cents"?: number,"sku"?: string
                  }
                  Relationships: [
                    
                  ]
                },"coin_purchases": {
                  Row: {
                    "coins": number,"created_at": string,"gross_cents": number,"id": string,"platform_fee_cents": number,"processor": string,"processor_txn_id": string | null,"product_id": string,"user_id": string
                  }
                  Insert: {
                    "coins": number,"created_at"?: string,"gross_cents": number,"id"?: string,"platform_fee_cents"?: number,"processor": string,"processor_txn_id"?: string | null,"product_id": string,"user_id": string
                  }
                  Update: {
                    "coins"?: number,"created_at"?: string,"gross_cents"?: number,"id"?: string,"platform_fee_cents"?: number,"processor"?: string,"processor_txn_id"?: string | null,"product_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coin_purchases_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "coin_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coin_purchases_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"deleted_at": string | null,"id": string,"like_count": number,"parent_id": string | null,"post_id": string
                  }
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"like_count"?: number,"parent_id"?: string | null,"post_id": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"like_count"?: number,"parent_id"?: string | null,"post_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_members": {
                  Row: {
                    "conversation_id": string,"joined_at": string,"last_read_at": string | null,"left_at": string | null,"muted_until": string | null,"user_id": string
                  }
                  Insert: {
                    "conversation_id": string,"joined_at"?: string,"last_read_at"?: string | null,"left_at"?: string | null,"muted_until"?: string | null,"user_id": string
                  }
                  Update: {
                    "conversation_id"?: string,"joined_at"?: string,"last_read_at"?: string | null,"left_at"?: string | null,"muted_until"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_members_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"is_group": boolean,"last_message_at": string | null,"title": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"is_group"?: boolean,"last_message_at"?: string | null,"title"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"is_group"?: boolean,"last_message_at"?: string | null,"title"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"creator_terms": {
                  Row: {
                    "created_at": string,"creator_share_bps": number,"effective_from": string,"id": string,"min_payout_cents": number,"payout_delay_days": number,"summary": string,"superseded_at": string | null,"user_id": string | null,"version": number
                  }
                  Insert: {
                    "created_at"?: string,"creator_share_bps": number,"effective_from": string,"id"?: string,"min_payout_cents"?: number,"payout_delay_days"?: number,"summary": string,"superseded_at"?: string | null,"user_id"?: string | null,"version": number
                  }
                  Update: {
                    "created_at"?: string,"creator_share_bps"?: number,"effective_from"?: string,"id"?: string,"min_payout_cents"?: number,"payout_delay_days"?: number,"summary"?: string,"superseded_at"?: string | null,"user_id"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "creator_terms_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"devices": {
                  Row: {
                    "id": string,"last_seen_at": string,"platform": string,"push_token": string,"user_id": string
                  }
                  Insert: {
                    "id"?: string,"last_seen_at"?: string,"platform": string,"push_token": string,"user_id": string
                  }
                  Update: {
                    "id"?: string,"last_seen_at"?: string,"platform"?: string,"push_token"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "devices_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"follows": {
                  Row: {
                    "created_at": string,"followee_id": string,"follower_id": string
                  }
                  Insert: {
                    "created_at"?: string,"followee_id": string,"follower_id": string
                  }
                  Update: {
                    "created_at"?: string,"followee_id"?: string,"follower_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "follows_followee_id_fkey"
      columns: ["followee_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follows_follower_id_fkey"
      columns: ["follower_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"friendships": {
                  Row: {
                    "addressee_id": string,"created_at": string,"requester_id": string,"responded_at": string | null,"status": Database["public"]['Enums']["friend_status"]
                  }
                  Insert: {
                    "addressee_id": string,"created_at"?: string,"requester_id": string,"responded_at"?: string | null,"status"?: Database["public"]['Enums']["friend_status"]
                  }
                  Update: {
                    "addressee_id"?: string,"created_at"?: string,"requester_id"?: string,"responded_at"?: string | null,"status"?: Database["public"]['Enums']["friend_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "friendships_addressee_id_fkey"
      columns: ["addressee_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "friendships_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"gift_catalog": {
                  Row: {
                    "active": boolean,"anchor_fallbacks": (string)[],"anchor_preferred": string | null,"animation_url": string | null,"asset_kind": string,"asset_url": string | null,"bleed_pct": number,"box_fill_pct": number | null,"coins": number,"duration_ms": number,"icon_concept": string | null,"icon_url": string,"id": string,"name": string,"render_mode": string,"tier": string | null
                  }
                  Insert: {
                    "active"?: boolean,"anchor_fallbacks"?: (string)[],"anchor_preferred"?: string | null,"animation_url"?: string | null,"asset_kind"?: string,"asset_url"?: string | null,"bleed_pct"?: number,"box_fill_pct"?: number | null,"coins": number,"duration_ms"?: number,"icon_concept"?: string | null,"icon_url"?: string,"id"?: string,"name": string,"render_mode"?: string,"tier"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"anchor_fallbacks"?: (string)[],"anchor_preferred"?: string | null,"animation_url"?: string | null,"asset_kind"?: string,"asset_url"?: string | null,"bleed_pct"?: number,"box_fill_pct"?: number | null,"coins"?: number,"duration_ms"?: number,"icon_concept"?: string | null,"icon_url"?: string,"id"?: string,"name"?: string,"render_mode"?: string,"tier"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"gift_events": {
                  Row: {
                    "app_store_fee_cents": number,"coins_total": number,"created_at": string,"creator_net_cents": number,"gift_id": string,"gross_cents": number,"id": string,"ledger_transaction_id": string | null,"platform_fee_cents": number,"post_id": string | null,"quantity": number,"recipient_id": string,"sender_id": string,"stream_id": string | null,"terms_id": string
                  }
                  Insert: {
                    "app_store_fee_cents": number,"coins_total": number,"created_at"?: string,"creator_net_cents": number,"gift_id": string,"gross_cents": number,"id"?: string,"ledger_transaction_id"?: string | null,"platform_fee_cents": number,"post_id"?: string | null,"quantity"?: number,"recipient_id": string,"sender_id": string,"stream_id"?: string | null,"terms_id": string
                  }
                  Update: {
                    "app_store_fee_cents"?: number,"coins_total"?: number,"created_at"?: string,"creator_net_cents"?: number,"gift_id"?: string,"gross_cents"?: number,"id"?: string,"ledger_transaction_id"?: string | null,"platform_fee_cents"?: number,"post_id"?: string | null,"quantity"?: number,"recipient_id"?: string,"sender_id"?: string,"stream_id"?: string | null,"terms_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gift_events_gift_id_fkey"
      columns: ["gift_id"]
isOneToOne: false
      referencedRelation: "gift_catalog"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gift_events_ledger_transaction_id_fkey"
      columns: ["ledger_transaction_id"]
isOneToOne: false
      referencedRelation: "ledger_transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gift_events_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gift_events_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gift_events_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gift_events_stream_id_fkey"
      columns: ["stream_id"]
isOneToOne: false
      referencedRelation: "live_streams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gift_events_terms_id_fkey"
      columns: ["terms_id"]
isOneToOne: false
      referencedRelation: "creator_terms"
      referencedColumns: ["id"]
    }
                  ]
                },"interactions": {
                  Row: {
                    "actor_id": string,"id": number,"kind": string,"occurred_at": string,"post_id": string | null,"stream_id": string | null,"subject_id": string
                  }
                  Insert: {
                    "actor_id": string,"id"?: number,"kind": string,"occurred_at"?: string,"post_id"?: string | null,"stream_id"?: string | null,"subject_id": string
                  }
                  Update: {
                    "actor_id"?: string,"id"?: number,"kind"?: string,"occurred_at"?: string,"post_id"?: string | null,"stream_id"?: string | null,"subject_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "interactions_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interactions_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interactions_stream_id_fkey"
      columns: ["stream_id"]
isOneToOne: false
      referencedRelation: "live_streams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interactions_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"ledger_accounts": {
                  Row: {
                    "created_at": string,"currency": string,"id": string,"kind": string,"owner_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"kind": string,"owner_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"kind"?: string,"owner_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_accounts_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"ledger_entries": {
                  Row: {
                    "account_id": string,"amount": number,"created_at": string,"currency": string,"id": number,"side": Database["public"]['Enums']["ledger_side"],"transaction_id": string
                  }
                  Insert: {
                    "account_id": string,"amount": number,"created_at"?: string,"currency": string,"id"?: number,"side": Database["public"]['Enums']["ledger_side"],"transaction_id": string
                  }
                  Update: {
                    "account_id"?: string,"amount"?: number,"created_at"?: string,"currency"?: string,"id"?: number,"side"?: Database["public"]['Enums']["ledger_side"],"transaction_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_entries_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "ledger_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "ledger_transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"ledger_transactions": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"memo": string | null,"reference_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": string,"memo"?: string | null,"reference_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"memo"?: string | null,"reference_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"likes": {
                  Row: {
                    "created_at": string,"post_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"post_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"post_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "likes_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "likes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"live_chat_messages": {
                  Row: {
                    "body": string,"created_at": string,"deleted_at": string | null,"id": number,"stream_id": string,"user_id": string
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"deleted_at"?: string | null,"id"?: number,"stream_id": string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: number,"stream_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "live_chat_messages_stream_id_fkey"
      columns: ["stream_id"]
isOneToOne: false
      referencedRelation: "live_streams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "live_chat_messages_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"live_participants": {
                  Row: {
                    "joined_at": string,"left_at": string | null,"role": string,"stream_id": string,"user_id": string,"watch_ms": number
                  }
                  Insert: {
                    "joined_at"?: string,"left_at"?: string | null,"role"?: string,"stream_id": string,"user_id": string,"watch_ms"?: number
                  }
                  Update: {
                    "joined_at"?: string,"left_at"?: string | null,"role"?: string,"stream_id"?: string,"user_id"?: string,"watch_ms"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "live_participants_stream_id_fkey"
      columns: ["stream_id"]
isOneToOne: false
      referencedRelation: "live_streams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "live_participants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"live_streams": {
                  Row: {
                    "created_at": string,"ended_at": string | null,"host_id": string,"id": string,"ingest_url": string | null,"is_adult_only": boolean,"peak_viewers": number,"playback_url": string | null,"provider": string,"provider_room_id": string | null,"recording_media_id": string | null,"scheduled_for": string | null,"started_at": string | null,"status": Database["public"]['Enums']["stream_status"],"title": string | null,"total_viewers": number
                  }
                  Insert: {
                    "created_at"?: string,"ended_at"?: string | null,"host_id": string,"id"?: string,"ingest_url"?: string | null,"is_adult_only"?: boolean,"peak_viewers"?: number,"playback_url"?: string | null,"provider": string,"provider_room_id"?: string | null,"recording_media_id"?: string | null,"scheduled_for"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["stream_status"],"title"?: string | null,"total_viewers"?: number
                  }
                  Update: {
                    "created_at"?: string,"ended_at"?: string | null,"host_id"?: string,"id"?: string,"ingest_url"?: string | null,"is_adult_only"?: boolean,"peak_viewers"?: number,"playback_url"?: string | null,"provider"?: string,"provider_room_id"?: string | null,"recording_media_id"?: string | null,"scheduled_for"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["stream_status"],"title"?: string | null,"total_viewers"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "live_streams_host_id_fkey"
      columns: ["host_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "live_streams_recording_media_id_fkey"
      columns: ["recording_media_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["id"]
    }
                  ]
                },"media_assets": {
                  Row: {
                    "bytes": number | null,"content_hash": string | null,"created_at": string,"deleted_at": string | null,"duration_ms": number | null,"height": number | null,"id": string,"kind": Database["public"]['Enums']["media_kind"],"owner_id": string,"playback_url": string | null,"poster_path": string | null,"provider": string,"provider_asset_id": string | null,"status": Database["public"]['Enums']["media_status"],"thumbnail_url": string | null,"width": number | null
                  }
                  Insert: {
                    "bytes"?: number | null,"content_hash"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"duration_ms"?: number | null,"height"?: number | null,"id"?: string,"kind": Database["public"]['Enums']["media_kind"],"owner_id": string,"playback_url"?: string | null,"poster_path"?: string | null,"provider": string,"provider_asset_id"?: string | null,"status"?: Database["public"]['Enums']["media_status"],"thumbnail_url"?: string | null,"width"?: number | null
                  }
                  Update: {
                    "bytes"?: number | null,"content_hash"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"duration_ms"?: number | null,"height"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["media_kind"],"owner_id"?: string,"playback_url"?: string | null,"poster_path"?: string | null,"provider"?: string,"provider_asset_id"?: string | null,"status"?: Database["public"]['Enums']["media_status"],"thumbnail_url"?: string | null,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_assets_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"message_requests": {
                  Row: {
                    "conversation_id": string | null,"created_at": string,"id": string,"recipient_id": string,"sender_id": string,"status": string
                  }
                  Insert: {
                    "conversation_id"?: string | null,"created_at"?: string,"id"?: string,"recipient_id": string,"sender_id": string,"status"?: string
                  }
                  Update: {
                    "conversation_id"?: string | null,"created_at"?: string,"id"?: string,"recipient_id"?: string,"sender_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_requests_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_requests_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_requests_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": string | null,"conversation_id": string,"created_at": string,"deleted_at": string | null,"edited_at": string | null,"id": string,"media_id": string | null,"reply_to_id": string | null,"sender_id": string,"shared_post_id": string | null
                  }
                  Insert: {
                    "body"?: string | null,"conversation_id": string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"media_id"?: string | null,"reply_to_id"?: string | null,"sender_id": string,"shared_post_id"?: string | null
                  }
                  Update: {
                    "body"?: string | null,"conversation_id"?: string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"media_id"?: string | null,"reply_to_id"?: string | null,"sender_id"?: string,"shared_post_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_reply_to_id_fkey"
      columns: ["reply_to_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_shared_post_id_fkey"
      columns: ["shared_post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"moderation_decisions": {
                  Row: {
                    "action": Database["public"]['Enums']["moderation_action"],"created_at": string,"expires_at": string | null,"id": string,"is_automated": boolean,"moderator_id": string | null,"policy_ref": string | null,"rationale": string,"report_id": string | null,"subject_user_id": string
                  }
                  Insert: {
                    "action": Database["public"]['Enums']["moderation_action"],"created_at"?: string,"expires_at"?: string | null,"id"?: string,"is_automated"?: boolean,"moderator_id"?: string | null,"policy_ref"?: string | null,"rationale": string,"report_id"?: string | null,"subject_user_id": string
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["moderation_action"],"created_at"?: string,"expires_at"?: string | null,"id"?: string,"is_automated"?: boolean,"moderator_id"?: string | null,"policy_ref"?: string | null,"rationale"?: string,"report_id"?: string | null,"subject_user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "moderation_decisions_moderator_id_fkey"
      columns: ["moderator_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_decisions_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "reports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_decisions_subject_user_id_fkey"
      columns: ["subject_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"body": string | null,"created_at": string,"id": number,"kind": string,"post_id": string | null,"read_at": string | null,"stream_id": string | null,"user_id": string
                  }
                  Insert: {
                    "actor_id"?: string | null,"body"?: string | null,"created_at"?: string,"id"?: number,"kind": string,"post_id"?: string | null,"read_at"?: string | null,"stream_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"body"?: string | null,"created_at"?: string,"id"?: number,"kind"?: string,"post_id"?: string | null,"read_at"?: string | null,"stream_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_stream_id_fkey"
      columns: ["stream_id"]
isOneToOne: false
      referencedRelation: "live_streams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_accounts": {
                  Row: {
                    "created_at": string,"kyc_status": string,"payouts_enabled": boolean,"processor": string,"processor_account_id": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"kyc_status"?: string,"payouts_enabled"?: boolean,"processor"?: string,"processor_account_id"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"kyc_status"?: string,"payouts_enabled"?: boolean,"processor"?: string,"processor_account_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_accounts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"payouts": {
                  Row: {
                    "amount_cents": number,"currency": string,"failure_reason": string | null,"id": string,"ledger_transaction_id": string | null,"paid_at": string | null,"period_end": string,"period_start": string,"processor_transfer_id": string | null,"requested_at": string,"status": Database["public"]['Enums']["payout_status"],"user_id": string
                  }
                  Insert: {
                    "amount_cents": number,"currency"?: string,"failure_reason"?: string | null,"id"?: string,"ledger_transaction_id"?: string | null,"paid_at"?: string | null,"period_end": string,"period_start": string,"processor_transfer_id"?: string | null,"requested_at"?: string,"status"?: Database["public"]['Enums']["payout_status"],"user_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"currency"?: string,"failure_reason"?: string | null,"id"?: string,"ledger_transaction_id"?: string | null,"paid_at"?: string | null,"period_end"?: string,"period_start"?: string,"processor_transfer_id"?: string | null,"requested_at"?: string,"status"?: Database["public"]['Enums']["payout_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payouts_ledger_transaction_id_fkey"
      columns: ["ledger_transaction_id"]
isOneToOne: false
      referencedRelation: "ledger_transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payouts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"post_daily_stats": {
                  Row: {
                    "comments": number,"day": string,"impressions": number,"likes": number,"post_id": string,"reached_users": number,"shares": number,"watch_ms": number
                  }
                  Insert: {
                    "comments"?: number,"day": string,"impressions"?: number,"likes"?: number,"post_id": string,"reached_users"?: number,"shares"?: number,"watch_ms"?: number
                  }
                  Update: {
                    "comments"?: number,"day"?: string,"impressions"?: number,"likes"?: number,"post_id"?: string,"reached_users"?: number,"shares"?: number,"watch_ms"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_daily_stats_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"post_media": {
                  Row: {
                    "media_id": string,"position": number,"post_id": string
                  }
                  Insert: {
                    "media_id": string,"position"?: number,"post_id": string
                  }
                  Update: {
                    "media_id"?: string,"position"?: number,"post_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_media_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_media_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"posts": {
                  Row: {
                    "allow_comments": boolean,"allow_gifts": boolean,"author_id": string,"caption": string | null,"comment_count": number,"created_at": string,"deleted_at": string | null,"expires_at": string | null,"id": string,"kind": Database["public"]['Enums']["post_kind"],"like_count": number,"view_count": number,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  Insert: {
                    "allow_comments"?: boolean,"allow_gifts"?: boolean,"author_id": string,"caption"?: string | null,"comment_count"?: number,"created_at"?: string,"deleted_at"?: string | null,"expires_at"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["post_kind"],"like_count"?: number,"view_count"?: number,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Update: {
                    "allow_comments"?: boolean,"allow_gifts"?: boolean,"author_id"?: string,"caption"?: string | null,"comment_count"?: number,"created_at"?: string,"deleted_at"?: string | null,"expires_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["post_kind"],"like_count"?: number,"view_count"?: number,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "posts_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_media_id": string | null,"bio": string | null,"display_name": string | null,"is_creator": boolean,"is_verified": boolean,"link_url": string | null,"post_count": number,"updated_at": string,"user_id": string,"username": string
                  }
                  Insert: {
                    "avatar_media_id"?: string | null,"bio"?: string | null,"display_name"?: string | null,"is_creator"?: boolean,"is_verified"?: boolean,"link_url"?: string | null,"post_count"?: number,"updated_at"?: string,"user_id": string,"username": string
                  }
                  Update: {
                    "avatar_media_id"?: string | null,"bio"?: string | null,"display_name"?: string | null,"is_creator"?: boolean,"is_verified"?: boolean,"link_url"?: string | null,"post_count"?: number,"updated_at"?: string,"user_id"?: string,"username"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"reach_events": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"explanation": string,"id": number,"multiplier": number,"post_id": string,"reason": Database["public"]['Enums']["reach_reason"]
                  }
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"explanation": string,"id"?: number,"multiplier"?: number,"post_id": string,"reason": Database["public"]['Enums']["reach_reason"]
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"explanation"?: string,"id"?: number,"multiplier"?: number,"post_id"?: string,"reason"?: Database["public"]['Enums']["reach_reason"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "reach_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reach_events_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"relationships": {
                  Row: {
                    "actor_id": string,"distinct_weeks": number,"first_seen_at": string,"interaction_count": number,"last_seen_at": string,"state": string,"subject_id": string
                  }
                  Insert: {
                    "actor_id": string,"distinct_weeks"?: number,"first_seen_at": string,"interaction_count"?: number,"last_seen_at": string,"state"?: string,"subject_id": string
                  }
                  Update: {
                    "actor_id"?: string,"distinct_weeks"?: number,"first_seen_at"?: string,"interaction_count"?: number,"last_seen_at"?: string,"state"?: string,"subject_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "relationships_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relationships_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"detail": string | null,"id": string,"priority": number,"reason": Database["public"]['Enums']["report_reason"],"reporter_id": string | null,"resolved_at": string | null,"status": Database["public"]['Enums']["report_status"],"target_message_id": string | null,"target_post_id": string | null,"target_stream_id": string | null,"target_user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"detail"?: string | null,"id"?: string,"priority"?: number,"reason": Database["public"]['Enums']["report_reason"],"reporter_id"?: string | null,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"target_message_id"?: string | null,"target_post_id"?: string | null,"target_stream_id"?: string | null,"target_user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"detail"?: string | null,"id"?: string,"priority"?: number,"reason"?: Database["public"]['Enums']["report_reason"],"reporter_id"?: string | null,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"target_message_id"?: string | null,"target_post_id"?: string | null,"target_stream_id"?: string | null,"target_user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_target_message_id_fkey"
      columns: ["target_message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_target_post_id_fkey"
      columns: ["target_post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_target_stream_id_fkey"
      columns: ["target_stream_id"]
isOneToOne: false
      referencedRelation: "live_streams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_target_user_id_fkey"
      columns: ["target_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"users": {
                  Row: {
                    "age_verification_ref": string | null,"age_verified": boolean,"age_verified_at": string | null,"app_role": string,"country_code": string | null,"created_at": string,"date_of_birth": string | null,"deleted_at": string | null,"email": string | null,"id": string,"phone": string | null,"status": Database["public"]['Enums']["account_status"]
                  }
                  Insert: {
                    "age_verification_ref"?: string | null,"age_verified"?: boolean,"age_verified_at"?: string | null,"app_role"?: string,"country_code"?: string | null,"created_at"?: string,"date_of_birth"?: string | null,"deleted_at"?: string | null,"email"?: string | null,"id": string,"phone"?: string | null,"status"?: Database["public"]['Enums']["account_status"]
                  }
                  Update: {
                    "age_verification_ref"?: string | null,"age_verified"?: boolean,"age_verified_at"?: string | null,"app_role"?: string,"country_code"?: string | null,"created_at"?: string,"date_of_birth"?: string | null,"deleted_at"?: string | null,"email"?: string | null,"id"?: string,"phone"?: string | null,"status"?: Database["public"]['Enums']["account_status"]
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "ledger_balances": {
                  Row: {
                    "account_id": string | null,"balance": number | null,"currency": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_entries_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "ledger_accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"message_requests_inbox": {
                  Row: {
                    "created_at": string | null,"id": string | null,"sender_id": string | null,"status": string | null
                  }
                  Insert: {
                           "created_at"?: string | null,"id"?: string | null,"sender_id"?: string | null,"status"?: string | null
                         }
                        Update: {
                           "created_at"?: string | null,"id"?: string | null,"sender_id"?: string | null,"status"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "message_requests_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"public_profiles": {
                  Row: {
                    "avatar_media_id": string | null,"bio": string | null,"display_name": string | null,"is_creator": boolean | null,"is_verified": boolean | null,"link_url": string | null,"updated_at": string | null,"user_id": string | null,"username": string | null
                  }
                  Insert: {
                           "avatar_media_id"?: string | null,"bio"?: string | null,"display_name"?: string | null,"is_creator"?: boolean | null,"is_verified"?: boolean | null,"link_url"?: string | null,"updated_at"?: string | null,"user_id"?: string | null,"username"?: string | null
                         }
                        Update: {
                           "avatar_media_id"?: string | null,"bio"?: string | null,"display_name"?: string | null,"is_creator"?: boolean | null,"is_verified"?: boolean | null,"link_url"?: string | null,"updated_at"?: string | null,"user_id"?: string | null,"username"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "can_dm":
{ Args: { "a": string,"b": string }; Returns: boolean
                           },
"can_view_post":
{ Args: { "p_post": string,"p_viewer": string }; Returns: boolean
                           },
"is_adult":
{ Args: { "uid": string }; Returns: boolean
                           },
"is_age_verified_adult":
{ Args: { "uid": string }; Returns: boolean
                           },
"is_mutual":
{ Args: { "a": string,"b": string }; Returns: boolean
                           },
"relationship_state":
{ Args: { "actor": string,"subject": string }; Returns: string
                           },
"show_limit":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"show_trgm":
{ Args: { "": string }; Returns: (string)[]
                           }
          }
          Enums: {
            "account_status": "active"|"suspended"|"deactivated"|"banned","friend_status": "pending"|"accepted"|"declined"|"blocked","ledger_side": "debit"|"credit","media_kind": "image"|"video"|"audio","media_status": "uploading"|"processing"|"ready"|"failed","moderation_action": "none"|"warn"|"age_gate"|"limit_reach"|"remove_content"|"suspend"|"ban"|"law_enforcement_referral","payout_status": "pending"|"processing"|"paid"|"failed"|"reversed","post_kind": "post"|"reel"|"story","reach_reason": "normal"|"new_account"|"low_quality_signal"|"duplicate_content"|"moderation_limit"|"viewer_preference"|"rate_limited"|"boosted","report_reason": "spam"|"harassment"|"nudity"|"violence"|"csam"|"self_harm"|"illegal"|"impersonation"|"ip"|"other","report_status": "open"|"triaging"|"actioned"|"dismissed"|"appealed","stream_status": "scheduled"|"live"|"ended"|"errored","visibility": "public"|"followers"|"friends"|"private"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_status": ["active", "suspended", "deactivated", "banned"],"friend_status": ["pending", "accepted", "declined", "blocked"],"ledger_side": ["debit", "credit"],"media_kind": ["image", "video", "audio"],"media_status": ["uploading", "processing", "ready", "failed"],"moderation_action": ["none", "warn", "age_gate", "limit_reach", "remove_content", "suspend", "ban", "law_enforcement_referral"],"payout_status": ["pending", "processing", "paid", "failed", "reversed"],"post_kind": ["post", "reel", "story"],"reach_reason": ["normal", "new_account", "low_quality_signal", "duplicate_content", "moderation_limit", "viewer_preference", "rate_limited", "boosted"],"report_reason": ["spam", "harassment", "nudity", "violence", "csam", "self_harm", "illegal", "impersonation", "ip", "other"],"report_status": ["open", "triaging", "actioned", "dismissed", "appealed"],"stream_status": ["scheduled", "live", "ended", "errored"],"visibility": ["public", "followers", "friends", "private"]
          }
        }
} as const


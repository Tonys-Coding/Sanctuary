export type Lang = 'es' | 'en'
export type Theme = 'light' | 'dark' | 'system'
export type Method = 'cash' | 'check' | 'card' | 'transfer' | 'other'

export interface User { id: string; org_id: string; email: string; full_name: string; avatar_file: string | null; language: Lang; theme: Theme }
export interface Org {
  id: string; name: string; legal_name: string | null; tax_id: string | null; address: string | null; city: string | null; state: string | null
  postal_code: string | null; country: string; phone: string | null; email: string | null; pastor_name: string | null; treasurer_name: string | null
  currency: string; logo_file: string | null; statement_note: string | null
}
export interface Session { user: User; org: Org; features: { ai: boolean; email: boolean; sms: boolean } }

export interface Member {
  id: string; first_name: string; last_name: string; full_name: string; email: string | null; phone: string | null; address: string | null
  city: string | null; state: string | null; postal_code: string | null; birth_date: string | null; joined_date: string | null
  status: 'active' | 'inactive' | 'visitor'; church_role: 'pastor' | 'leader' | 'member' | 'visitor'; envelope_number: string | null
  notes: string | null; avatar_file: string | null; total_year: number; total_all: number; offering_count: number; last_date: string | null
  /** Totals for each of the last 12 months, oldest first. */
  spark: number[]; months_given: number
  /** The member agreed to receive text messages. */
  sms_opt_in: boolean
}
export interface Fund { id: string; name: string; color_slot: number; tax_deductible: boolean; archived_at: string | null; total_year: number; offering_count: number }
export interface Offering {
  id: string; amount: number; date: string; method: Method; check_number: string | null; notes: string | null; member_id: string | null
  fund_id: string; batch_id: string | null; member_name: string | null; member_avatar: string | null; fund_name: string; fund_color: number; batch_name: string | null
}
export interface Batch {
  id: string; date: string; name: string; attendance: number | null; counted_by: string | null; notes: string | null
  denominations: Record<string, number>; status: 'open' | 'closed'; total: number; cash_total: number; offering_count: number
}
export interface Goal {
  id: string; name: string; description: string | null; fund_id: string | null; fund_name: string | null; fund_color: number | null
  target_amount: number; start_date: string; end_date: string; raised: number; givers: number
}
export interface ReportColumn { key: string; label: string; kind: 'text' | 'money' | 'number' | 'date' | 'percent' }
export interface Report {
  type: string; title: string; subtitle: string; from: string; to: string
  highlights: { label: string; value: number; kind: ReportColumn['kind'] }[]
  sections: { title?: string; columns: ReportColumn[]; rows: Record<string, any>[]; total?: Record<string, any> }[]
}

export interface SmsMessage {
  id: string; batch_id: string | null; member_id: string | null; member_name: string | null; member_avatar: string | null; to_phone: string; body: string
  kind: 'manual' | 'reminder' | 'birthday'; status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'canceled'
  send_at: string; sent_at: string | null; error: string | null; created_at: string
}

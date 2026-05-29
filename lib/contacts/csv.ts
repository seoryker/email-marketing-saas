import Papa from 'papaparse'

export type ParsedRow = Record<string, string>

export type MappedContact = {
  email: string
  first_name: string
  last_name: string
  phone?: string
  company?: string
  custom_fields?: Record<string, unknown>
}

export type ColumnMapping = {
  csv_column: string
  contact_field: string | null
}

const FIELD_ALIASES: Record<string, string> = {
  'email': 'email',
  'email address': 'email',
  'e-mail': 'email',
  'first name': 'first_name',
  'firstname': 'first_name',
  'first_name': 'first_name',
  'last name': 'last_name',
  'lastname': 'last_name',
  'last_name': 'last_name',
  'phone': 'phone',
  'phone number': 'phone',
  'mobile': 'phone',
  'company': 'company',
  'organisation': 'company',
  'organization': 'company',
}

export function parseCSV(file: File): Promise<{ headers: string[]; rows: ParsedRow[] }> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({
          headers: results.meta.fields ?? [],
          rows: results.data as ParsedRow[],
        })
      },
      error: reject,
    })
  })
}

export function autoDetectColumns(headers: string[]): ColumnMapping[] {
  return headers.map((col) => ({
    csv_column: col,
    contact_field: FIELD_ALIASES[col.toLowerCase()] ?? null,
  }))
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function applyMapping(
  rows: ParsedRow[],
  mapping: ColumnMapping[],
  customFieldKeys: string[] = []
): { valid: MappedContact[]; invalidEmails: number } {
  const valid: MappedContact[] = []
  let invalidEmails = 0

  for (const row of rows) {
    const contact: MappedContact = {
      email: '',
      first_name: '',
      last_name: '',
      custom_fields: {},
    }

    for (const { csv_column, contact_field } of mapping) {
      if (!contact_field) continue
      const value = (row[csv_column] ?? '').trim()
      if (contact_field === 'email') contact.email = value
      else if (contact_field === 'first_name') contact.first_name = value
      else if (contact_field === 'last_name') contact.last_name = value
      else if (contact_field === 'phone') contact.phone = value
      else if (contact_field === 'company') contact.company = value
      else if (customFieldKeys.includes(contact_field)) {
        contact.custom_fields![contact_field] = value
      }
    }

    if (!contact.email || !isValidEmail(contact.email)) {
      invalidEmails++
      continue
    }
    valid.push(contact)
  }

  return { valid, invalidEmails }
}

export function generateSampleCSV(): string {
  return Papa.unparse([
    { 'First Name': 'Alice', 'Last Name': 'Smith', 'Email': 'alice@example.com', 'Phone': '+1 555 0100', 'Company': 'Acme Inc' },
    { 'First Name': 'Bob', 'Last Name': 'Jones', 'Email': 'bob@example.com', 'Phone': '', 'Company': '' },
  ])
}

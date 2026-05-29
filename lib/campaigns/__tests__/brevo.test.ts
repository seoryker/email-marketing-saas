import { describe, it, expect } from 'vitest'
import { replaceMergeTags } from '../brevo'

describe('replaceMergeTags', () => {
  it('replaces first_name', () => {
    expect(replaceMergeTags('Hello {{first_name}}', {
      first_name: 'Rahul', last_name: 'Sharma', email: 'r@test.com', company: null
    })).toBe('Hello Rahul')
  })

  it('replaces all merge tags', () => {
    const html = '{{first_name}} {{last_name}} {{email}} {{company}}'
    expect(replaceMergeTags(html, {
      first_name: 'Alice', last_name: 'Smith', email: 'a@test.com', company: 'Acme'
    })).toBe('Alice Smith a@test.com Acme')
  })

  it('replaces null company with empty string', () => {
    expect(replaceMergeTags('Co: {{company}}', {
      first_name: '', last_name: '', email: 'a@test.com', company: null
    })).toBe('Co: ')
  })

  it('replaces all occurrences (global replace)', () => {
    expect(replaceMergeTags('{{first_name}} and {{first_name}}', {
      first_name: 'Bob', last_name: '', email: 'b@test.com', company: null
    })).toBe('Bob and Bob')
  })
})

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BankDetails } from '@/components/public/bank-details'
import { BANK_ACCOUNT, BANK_FIELDS } from '@/lib/society'

describe('society bank details', () => {
  it('shows every field the society supplied', () => {
    render(<BankDetails />)

    for (const field of BANK_FIELDS) {
      expect(screen.getByText(field.label)).toBeInTheDocument()
      expect(screen.getByText(field.value)).toBeInTheDocument()
    }
  })

  it('renders the account, routing and SWIFT values in Latin digits', () => {
    // A member retypes these into a banking app. Rendering them in Bengali
    // numerals like the rest of the interface would invite a mistyped transfer,
    // so they must never pass through toBnDigits.
    const { container } = render(<BankDetails />)

    expect(screen.getByText(BANK_ACCOUNT.accountNumber).textContent).toBe('2077472630001')
    expect(screen.getByText(BANK_ACCOUNT.routingNumber).textContent).toBe('060191162')
    expect(screen.getByText(BANK_ACCOUNT.swiftCode).textContent).toBe('BRAKBDDH')

    expect(container.textContent).not.toMatch(/[০-৯]/)
  })

  it('offers a copy control for each value that gets retyped', () => {
    render(<BankDetails />)

    const verbatim = BANK_FIELDS.filter((field) => field.verbatim)
    expect(verbatim).toHaveLength(3)

    for (const field of verbatim) {
      expect(screen.getByRole('button', { name: `${field.label} কপি করুন` })).toBeInTheDocument()
    }
  })

  it('tells the member that sending money alone is not enough', () => {
    render(<BankDetails />)
    expect(screen.getByText(/লেনদেনের তথ্য ও স্ক্রিনশট জমা দিন/)).toBeInTheDocument()
  })

  it('points at the form when it is on another page', () => {
    // On the home page there is no form below, so the note has to link to it.
    render(<BankDetails formHref="/pay/submit" />)

    const link = screen.getByRole('link', { name: /লেনদেনের তথ্য ও স্ক্রিনশট জমা দিন/ })
    expect(link).toHaveAttribute('href', '/pay/submit')
  })

  it('says "the form below" when the form is on the same page', () => {
    render(<BankDetails />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText(/নিচের ফরমে/)).toBeInTheDocument()
  })
})

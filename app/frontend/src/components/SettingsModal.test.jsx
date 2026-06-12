import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import SettingsModal from './SettingsModal'
import { api } from '../api'

vi.mock('../api', () => ({
  api: {
    setMinimumReputation: vi.fn(),
    setBlacklists: vi.fn()
  }
}))

const session = {
  account: {name: 'fixture-curator'},
  preferences: {
    minimum_reputation: 25,
    hivewatchers_blacklist_enabled: false
  },
  blacklist_sources: [
    {account: 'fixture-curator', name: 'fixture-curator'},
    {account: 'hive.blog', name: 'hive.blog'}
  ],
  offchain_blacklist_sources: [
    {account: 'hivewatchers', name: 'Hivewatchers', description: 'Powered by the Spaminator active blacklist.'}
  ]
}

describe('SettingsModal', () => {
  beforeEach(() => {
    api.setMinimumReputation.mockResolvedValue({minimum_reputation: 35})
    api.setBlacklists.mockResolvedValue({
      hivewatchers_blacklist_enabled: true,
      offchain_blacklist_sources: [
        {account: 'hivewatchers', name: 'Hivewatchers', enabled: true, description: 'Powered by the Spaminator active blacklist.'}
      ]
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  test('renders account blacklist sources and settings links', () => {
    render(<SettingsModal session={session} onSave={vi.fn()} onError={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('spinbutton', {name: 'Minimum reputation'})).toHaveValue(25)
    expect(screen.getByText('@hive.blog')).toBeInTheDocument()
    expect(screen.getByRole('link', {name: 'blacklist subscriptions'})).toHaveAttribute('href', 'https://hive.blog/@fixture-curator/lists/followed_blacklists')
    expect(screen.getByLabelText(/Hivewatchers/)).not.toBeChecked()
    expect(screen.getByRole('link', {name: 'Tag management'})).toHaveAttribute('href', '/tags')
    expect(screen.getByRole('link', {name: 'Legacy Inbox'})).toHaveAttribute('href', '/posts')
  })

  test('saves reputation and off-chain blacklist preferences together', async () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(<SettingsModal session={session} onSave={onSave} onError={vi.fn()} onClose={onClose} />)

    fireEvent.change(screen.getByRole('spinbutton', {name: 'Minimum reputation'}), {target: {value: '35'}})
    fireEvent.click(screen.getByLabelText(/Hivewatchers/))
    fireEvent.click(screen.getByRole('button', {name: 'Save'}))

    await waitFor(() => expect(api.setMinimumReputation).toHaveBeenCalledWith('35'))
    expect(api.setBlacklists).toHaveBeenCalledWith({hivewatchers_blacklist_enabled: true})
    expect(onSave).toHaveBeenCalledWith({
      preferences: {
        minimum_reputation: 35,
        hivewatchers_blacklist_enabled: true
      },
      offchain_blacklist_sources: [
        {account: 'hivewatchers', name: 'Hivewatchers', enabled: true, description: 'Powered by the Spaminator active blacklist.'}
      ]
    })
    expect(onClose).toHaveBeenCalled()
  })

  test('reports save errors without closing', async () => {
    const onError = vi.fn()
    const onClose = vi.fn()
    api.setMinimumReputation.mockRejectedValue(new Error('Preference save failed'))

    render(<SettingsModal session={session} onSave={vi.fn()} onError={onError} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', {name: 'Save'}))

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Preference save failed'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

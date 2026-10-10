import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import HivesignerVoteModal from './HivesignerVoteModal'

const url = 'https://hivesigner.com/sign/vote?weight=4200'

afterEach(cleanup)

describe('HiveSigner approval handoff', () => {
  test('checks on return only after opening the signing link', () => {
    const onClose = vi.fn()
    render(<HivesignerVoteModal url={url} onClose={onClose} />)
    fireEvent(window, new Event('focus'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('link', {name: 'Open HiveSigner'}))
    fireEvent(window, new Event('focus'))
    fireEvent(window, new Event('focus'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('allows checking manually when the browser does not report focus', () => {
    const onClose = vi.fn()
    render(<HivesignerVoteModal url={url} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', {name: 'Check vote'}))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('removes the return listener when dismissed or switched to another post', () => {
    const onClose = vi.fn()
    const {unmount} = render(<HivesignerVoteModal url={url} onClose={onClose} />)
    fireEvent.click(screen.getByRole('link', {name: 'Open HiveSigner'}))
    unmount()
    fireEvent(window, new Event('focus'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

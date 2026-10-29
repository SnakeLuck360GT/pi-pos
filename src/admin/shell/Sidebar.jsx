import { Icon, resetTours } from '../../ui/index.jsx'
import { NAV, hrefFor } from './routes.js'

// Plain links with pushState, so middle-click and "open in new tab" still work.
function NavLink({ path, label, icon, active, navigate }) {
  return (
    <a
      href={hrefFor(path)} className={`adm-nav__item${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        navigate(path)
      }}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </a>
  )
}

export default function Sidebar({ path, navigate, shopName, open, onClose, onSetup, onSignOut }) {
  return (
    <>
      {open && <div className="adm-side__scrim" onPointerDown={onClose} />}
      <aside className={`adm-side${open ? ' is-open' : ''}`}>
        <div className="adm-side__head">
          <div className="adm-side__app">PiPOS</div>
          {shopName && <div className="adm-side__shop">{shopName}</div>}
        </div>

        <nav className="adm-nav">
          {NAV.map((g, i) => (
            <div key={g.group || i} className="adm-nav__group" data-tour={g.tour}>
              {g.group && <div className="adm-nav__label">{g.group}</div>}
              {g.items.map(r => <NavLink key={r.path} {...r} active={r.path === path} navigate={navigate} />)}
            </div>
          ))}
        </nav>

        <div className="adm-side__foot">
          <button type="button" className="adm-nav__item" onClick={onSetup} data-tour="setup">
            <Icon name="sliders" />
            <span>Setup</span>
          </button>
          <a className="adm-nav__item" href="/" target="_blank" rel="noopener" data-tour="open-pos">
            <Icon name="external" />
            <span>Open POS</span>
          </a>
          <button type="button" className="adm-nav__item" onClick={onSignOut}>
            <Icon name="logout" />
            <span>Sign out</span>
          </button>
          <button type="button" className="adm-side__tips" onClick={resetTours}>Show tips again</button>
        </div>
      </aside>
    </>
  )
}

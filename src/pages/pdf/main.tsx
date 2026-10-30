import { createRoot } from 'react-dom/client'
import '../common/base.css'
import './pdf.css'
import { PdfApp } from './PdfApp'

createRoot(document.getElementById('root')!).render(<PdfApp />)

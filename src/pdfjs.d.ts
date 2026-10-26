// Wersja „legacy” pdf.js działa też na starszych iPhone'ach; typy bierzemy z pakietu głównego.
declare module 'pdfjs-dist/legacy/build/pdf.min.mjs' {
  export * from 'pdfjs-dist'
}

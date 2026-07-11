import { useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import { apiSummarize, apiExtractFlashcards } from '../services/api';
import { useData } from '../contexts/DataContext';

export default function Notes() {
  const editorRef = useRef(null);
  const quillRef = useRef(null);
  const { notes, addNote, updateNote, deleteNote } = useData();
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState('');
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (editorRef.current && !quillRef.current) {
      quillRef.current = new Quill(editorRef.current, {
        theme: 'snow',
        placeholder: 'Start typing your study notes here...',
        modules: {
          toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            ['blockquote', 'code-block'],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            ['clean']
          ]
        }
      });
    }
  }, []);

  const handleSave = async () => {
    if (!quillRef.current) return;
    const content = quillRef.current.root.innerHTML;
    try {
      setLoading(true);
      if (activeNoteId) {
        await updateNote(activeNoteId, title || 'Untitled Note', content, '');
        alert('Note updated successfully!');
      } else {
        const res = await addNote(title || 'Untitled Note', content, '');
        if (res.note) {
          setActiveNoteId(res.note.id);
        }
        alert('Note saved successfully!');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save note.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewNote = () => {
    setActiveNoteId(null);
    setTitle('');
    setSummary('');
    if (quillRef.current) {
      quillRef.current.root.innerHTML = '';
    }
  };

  const handleSelectNote = (note) => {
    setActiveNoteId(note.id);
    setTitle(note.title || '');
    setSummary('');
    if (quillRef.current) {
      quillRef.current.root.innerHTML = note.content || '';
    }
  };

  const handleDeleteNote = async (id) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;
    try {
      if (activeNoteId === id) {
        handleNewNote();
      }
      await deleteNote(id);
    } catch (err) {
      console.error(err);
      alert('Failed to delete note.');
    }
  };

  const handleAIAction = async (action) => {
    if (!quillRef.current) return;
    const text = quillRef.current.getText();
    if (text.length < 10) return alert('Please write more text for the AI to analyze.');
    
    setLoading(true);
    try {
      if (action === 'summarize') {
        const res = await apiSummarize(text);
        setSummary(res.summary || 'Summary generation failed.');
      } else if (action === 'flashcards') {
        const res = await apiExtractFlashcards(text, title || 'Note Deck');
        alert(`Successfully extracted ${res.flashcards?.length || 0} flashcards!`);
      }
    } catch (err) {
      console.error(err);
      alert('AI Action failed.');
    } finally {
      setLoading(false);
    }
  };

  const filteredNotes = notes.filter(n =>
    (n.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (n.content || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="tab-pane active" id="notepad">
      <header className="top-header">
        <input 
          type="text" 
          className="note-title-input" 
          placeholder="Untitled Note" 
          value={title}
          onChange={e => setTitle(e.target.value)}
          style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.5rem', outline: 'none' }}
        />
        <div className="header-actions" style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="secondary-btn" onClick={handleNewNote} disabled={loading}>
            <i className="ph ph-plus"></i> New Note
          </button>
          <button className="primary-btn" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : (activeNoteId ? 'Update Note' : 'Save Note')}
          </button>
        </div>
      </header>

      <div className="editor-wrapper" style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 120px)' }}>
        {/* Left Sidebar: Notes list */}
        <div className="notes-sidebar" style={{
          width: '260px',
          background: 'var(--surface)',
          padding: '1rem',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          border: '1px solid var(--border)'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Saved Notes</h3>
          
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'white',
              fontSize: '0.85rem',
              outline: 'none'
            }}
          />

          <div className="notes-list" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {filteredNotes.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '1rem' }}>No notes found</div>
            ) : (
              filteredNotes.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleSelectNote(n)}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '8px',
                    background: activeNoteId === n.id ? 'var(--primary-dim)' : 'var(--surface-2)',
                    border: `1px solid ${activeNoteId === n.id ? 'var(--primary)' : 'transparent'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  className="note-list-item"
                >
                  <div style={{ flex: 1, minWidth: 0, marginRight: '0.5rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {n.title || 'Untitled'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {new Date(n.created_at || Date.now()).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNote(n.id);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      padding: '0.2rem',
                      transition: 'color 0.2s'
                    }}
                    onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                    onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    title="Delete Note"
                  >
                    <i className="ph ph-trash"></i>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Middle column: main editor */}
        <div className="main-editor" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div ref={editorRef} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', borderRadius: '8px' }}></div>
        </div>

        {/* Right column: AI sidebar */}
        <div className="ai-sidebar" style={{ width: '300px', backgroundColor: 'var(--surface)', padding: '1rem', borderRadius: '12px' }}>
          <h3>Apollo AI Actions</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>Extract insights from your notes instantly.</p>
          
          <button className="action-btn" onClick={() => handleAIAction('summarize')} disabled={loading} style={{ width: '100%', marginBottom: '0.5rem' }}>
            <div className="btn-icon"><i className="ph ph-magic-wand"></i></div>
            <span>Summarize</span>
          </button>
          
          <button className="action-btn" onClick={() => handleAIAction('flashcards')} disabled={loading} style={{ width: '100%', marginBottom: '1rem' }}>
            <div className="btn-icon"><i className="ph ph-cards"></i></div>
            <span>Extract Flashcards</span>
          </button>

          {summary && (
            <div className="summary-box" style={{ padding: '1rem', backgroundColor: 'rgba(45, 212, 191, 0.1)', border: '1px solid var(--primary)', borderRadius: '8px' }}>
              <h4 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>Summary</h4>
              <p style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>{summary}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


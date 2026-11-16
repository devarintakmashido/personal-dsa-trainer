const app = {
            state: {
                currentView: 'dashboard',
                addMode: 'manual',
                problems: [],
                stats: {
                    solvedToday: 0,
                    lastActiveDate: new Date().toDateString(),
                    attempts: [],
                    drafts: {}
                },
                practiceState: {
                    activeProblem: null,
                    mode: 'due',
                    filterTopic: 'ALL',
                    filterSubTopic: 'ALL',
                    filterDifficulty: 'ALL',
                    timerValue: 15 * 60,
                    timerInterval: null,
                    timeLeft: 15 * 60,
                    timerRunning: false,
                    step: 0,
                    scratchpad: '',
                    language: 'java',
                    sessionTarget: 3,
                    sessionCompleted: 0,
                    seenThisSession: []
                },
                editingProblemId: null,
                bulkPreview: null,
                bulkRaw: ''
            },

            async init() {
                this.loadData();
                await this.restoreIndexedBackup();
                this.state.practiceState.sessionTarget = this.state.stats.sessionTarget || 3;
                this.state.practiceState.sessionCompleted = this.state.stats.sessionCompleted || 0;
                this.state.practiceState.seenThisSession = this.state.stats.seenThisSession || [];
                this.migrateLegacyData();
                this.checkDailyReset();
                this.navigate('dashboard');
            },

            openBackupDB() {
                return new Promise((resolve, reject) => {
                    if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
                    const request = indexedDB.open('dsa-trainer-backup', 1);
                    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            },

            async restoreIndexedBackup() {
                try {
                    const db = await this.openBackupDB();
                    const snapshot = await new Promise((resolve, reject) => {
                        const request = db.transaction('snapshots').objectStore('snapshots').get('latest');
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    });
                    if (snapshot && snapshot.savedAt > (this.state.stats.savedAt || 0)) {
                        this.state.problems = snapshot.problems || [];
                        this.state.stats = { ...this.state.stats, ...(snapshot.stats || {}) };
                        this.state.stats.attempts ||= [];
                        this.state.stats.drafts ||= {};
                        this.showToast('Recovered your latest automatic backup.', 'success');
                    }
                    db.close();
                } catch (e) { console.warn('Automatic backup store unavailable; local browser storage remains active.', e); }
            },

            loadData() {
                const storedProblems = localStorage.getItem('dsa_problems');
                const storedStats = localStorage.getItem('dsa_stats');
                if (storedProblems) {
                    try { this.state.problems = JSON.parse(storedProblems); } catch (e) { console.error(e); }
                }
                if (storedStats) {
                    try { this.state.stats = JSON.parse(storedStats); } catch (e) { console.error(e); }
                }
                this.state.stats.attempts ||= [];
                this.state.stats.drafts ||= {};
            },

            migrateLegacyData() {
                let changed = false;
                this.state.problems.forEach(p => {
                    if (!p.topic) {
                        p.topic = p.pattern || p.category || 'General';
                        p.subTopic = p.subTopic || '';
                        changed = true;
                    }
                    if (!p.leetcodeUrl && p.title) {
                        p.leetcodeUrl = this.generateLeetCodeUrl(p.title);
                        changed = true;
                    }
                });
                if (changed) this.saveData();
            },

            generateLeetCodeUrl(title) {
                if (!title) return 'https://leetcode.com/problemset/';
                const slug = title
                    .toLowerCase()
                    .replace(/^\d+\.\s*/, '')
                    .replace(/[^a-z0-9\s-]/g, '')
                    .trim()
                    .replace(/\s+/g, '-');
                return `https://leetcode.com/problems/${slug}/`;
            },

            saveData() {
                this.state.stats.savedAt = Date.now();
                try {
                    localStorage.setItem('dsa_problems', JSON.stringify(this.state.problems));
                    localStorage.setItem('dsa_stats', JSON.stringify(this.state.stats));
                } catch (e) {
                    this.showToast('Browser storage is full or unavailable. Export a backup now.', 'error');
                }
                this.persistIndexedBackup();
            },

            async persistIndexedBackup() {
                try {
                    const db = await this.openBackupDB();
                    await new Promise((resolve, reject) => {
                        const tx = db.transaction('snapshots', 'readwrite');
                        tx.objectStore('snapshots').put({ problems: this.state.problems, stats: this.state.stats, savedAt: this.state.stats.savedAt }, 'latest');
                        tx.oncomplete = resolve;
                        tx.onerror = () => reject(tx.error);
                    });
                    db.close();
                } catch (e) { console.warn('Automatic IndexedDB backup failed.', e); }
            },

            checkDailyReset() {
                const today = new Date().toDateString();
                if (this.state.stats.lastActiveDate !== today) {
                    this.state.stats.solvedToday = 0;
                    this.state.stats.lastActiveDate = today;
                    this.saveData();
                }
            },

            escapeHTML(str) {
                if (!str) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            },

            showToast(message, type = 'info') {
                const container = document.getElementById('toast-container');
                const toast = document.createElement('div');
                const colors = {
                    success: 'bg-green-900/90 border-green-700 text-green-100',
                    error: 'bg-red-900/90 border-red-700 text-red-100',
                    info: 'bg-gray-800/95 border-gray-700 text-gray-100'
                };
                const icons = {
                    success: 'fa-circle-check text-green-400',
                    error: 'fa-circle-exclamation text-red-400',
                    info: 'fa-circle-info text-blue-400'
                };
                toast.className = `px-4 py-3 rounded-lg border shadow-lg flex items-center space-x-3 text-sm font-medium transition-all duration-300 transform translate-y-2 opacity-0 ${colors[type] || colors.info}`;
                toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${this.escapeHTML(message)}</span>`;
                container.appendChild(toast);

                requestAnimationFrame(() => {
                    toast.classList.remove('translate-y-2', 'opacity-0');
                });

                setTimeout(() => {
                    toast.classList.add('opacity-0', 'translate-y-2');
                    setTimeout(() => toast.remove(), 300);
                }, 3000);
            },

            addProblem(problemData, silent = false) {
                const newProblem = {
                    id: 'prob_' + Date.now() + Math.random().toString(36).substr(2, 5),
                    title: problemData.title,
                    leetcodeUrl: (problemData.leetcodeUrl && problemData.leetcodeUrl.trim()) ? problemData.leetcodeUrl.trim() : this.generateLeetCodeUrl(problemData.title),
                    difficulty: problemData.difficulty || 'Medium',
                    topic: problemData.topic || problemData.pattern || problemData.category || 'General',
                    subTopic: problemData.subTopic || '',
                    statement: problemData.statement || '',
                    hint: problemData.hint || 'Identify the underlying pattern trigger.',
                    solutionCode: problemData.solutionCode || '// Add your optimal code here',
                    timeComplexity: problemData.timeComplexity || 'O(?)',
                    spaceComplexity: problemData.spaceComplexity || 'O(?)',
                    nextReviewDate: Date.now(),
                    addedAt: Date.now()
                };
                this.state.problems.push(newProblem);
                if (!silent) {
                    this.saveData();
                    this.showToast('Problem added successfully!', 'success');
                    this.navigate('dashboard');
                }
            },

            updateProblemDetails(id, updatedFields) {
                const index = this.state.problems.findIndex(p => p.id === id);
                if (index !== -1) {
                    this.state.problems[index] = { ...this.state.problems[index], ...updatedFields };
                    this.saveData();
                    this.showToast('Problem updated successfully!', 'success');
                }
            },

            deleteProblem(id) {
                this.state.problems = this.state.problems.filter(p => p.id !== id);
                this.saveData();
                this.showToast('Problem deleted.', 'info');
                this.renderDashboard(document.getElementById('app-content'));
            },

            openClearAllModal() {
                if (this.state.problems.length === 0) {
                    this.showToast('Your problem bank is already empty.', 'info');
                    return;
                }
                document.getElementById('clear-all-modal').classList.remove('hidden');
            },

            closeClearAllModal() {
                document.getElementById('clear-all-modal').classList.add('hidden');
            },

            clearAllProblems() {
                this.state.problems = [];
                this.state.practiceState.activeProblem = null;
                this.saveData();
                this.closeClearAllModal();
                this.showToast('All problems have been cleared.', 'success');
                this.renderDashboard(document.getElementById('app-content'));
            },

            exportData() {
                const dataStr = JSON.stringify({
                    problems: this.state.problems,
                    stats: this.state.stats,
                    exportedAt: new Date().toISOString()
                }, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `dsa-trainer-backup-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                this.showToast('Backup JSON exported!', 'success');
            },

            importData(event) {
                const file = event.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const parsed = JSON.parse(e.target.result);
                        const rawProblems = Array.isArray(parsed) ? parsed : parsed.problems;
                        if (!Array.isArray(rawProblems)) throw new Error('Unrecognized JSON structure');
                        const problems = rawProblems.filter(p => p && typeof p.title === 'string' && p.title.trim()).map(item => {
                            let statement = item.statement || item.description || '';
                            if (item.examples && Array.isArray(item.examples)) statement += '\n\n' + item.examples.map((ex, idx) => `Example ${idx + 1}:\n Input: ${ex.input || ''}\n Output: ${ex.output || ''}${ex.explanation ? `\n Explanation: ${ex.explanation}` : ''}`).join('\n\n');
                            if (item.constraints && Array.isArray(item.constraints)) statement += '\n\nConstraints:\n ' + item.constraints.join('\n ');
                            return { ...item, title: item.title.trim(), statement: String(statement).trim(), leetcodeUrl: item.leetcodeUrl || item.url || this.generateLeetCodeUrl(item.title), difficulty: ['Easy','Medium','Hard'].includes(item.difficulty) ? item.difficulty : 'Medium', topic: item.topic || item.category || item.pattern || 'General', subTopic: item.subTopic || '', hint: item.hint || 'Identify the pattern trigger here.', solutionCode: item.solutionCode || '// Add optimal code here', timeComplexity: item.timeComplexity || 'O(?)', spaceComplexity: item.spaceComplexity || 'O(?)' };
                        });
                        if (!problems.length) throw new Error('No valid titled problems found');
                        this.state.importPreview = { problems, stats: Array.isArray(parsed) ? null : parsed.stats || null };
                        this.showImportPreview();
                    } catch (err) {
                        console.error(err);
                        this.showToast(`Import failed: ${err.message || 'check the JSON format.'}`, 'error');
                    }
                    event.target.value = '';
                };
                reader.readAsText(file);
            },

            showImportPreview() {
                document.getElementById('import-preview-modal')?.remove();
                const items = this.state.importPreview.problems;
                const existing = new Set(this.state.problems.map(p => p.title.toLowerCase()));
                const addedCount = items.filter(p => !existing.has(p.title.toLowerCase())).length;
                const modal = document.createElement('div');
                modal.id = 'import-preview-modal';
                modal.className = 'fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4';
                modal.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="import-preview-title" class="bg-gray-800 border border-gray-700 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-5"><div class="flex justify-between gap-4 items-start"><div><h2 id="import-preview-title" class="text-lg font-bold text-white">Review JSON import</h2><p class="text-sm text-gray-400 mt-1">${items.length} valid problems · ${addedCount} new titles · existing titles are skipped. Backup progress will be merged.</p></div><button onclick="app.cancelImportPreview()" aria-label="Close import preview" class="text-gray-400 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button></div><div class="overflow-auto max-h-96 mt-4"><table class="w-full text-sm text-left"><thead class="text-xs uppercase text-gray-400"><tr><th class="p-2">Problem</th><th class="p-2">Difficulty</th><th class="p-2">Topic</th><th class="p-2">Statement</th><th class="p-2">Import</th></tr></thead><tbody>${items.slice(0,100).map(p => { const dupe = existing.has(p.title.toLowerCase()); return `<tr class="border-t border-gray-700"><td class="p-2 text-white">${this.escapeHTML(p.title)}</td><td class="p-2">${this.escapeHTML(p.difficulty)}</td><td class="p-2">${this.escapeHTML(p.topic)}</td><td class="p-2 text-gray-400">${p.statement ? this.escapeHTML(p.statement.slice(0,100)) : '<span class="text-yellow-300">No statement</span>'}</td><td class="p-2 ${dupe ? 'text-yellow-300' : 'text-green-300'}">${dupe ? 'Duplicate' : 'Ready'}</td></tr>`; }).join('')}</tbody></table>${items.length > 100 ? `<p class="p-2 text-xs text-gray-400">Showing first 100 of ${items.length} items.</p>` : ''}</div><div class="flex justify-end gap-2 mt-4"><button onclick="app.cancelImportPreview()" class="px-4 py-2 bg-gray-700 rounded-lg text-white">Cancel</button><button onclick="app.confirmImportData()" class="px-4 py-2 bg-primary rounded-lg text-white font-bold">Import ${addedCount} new problems</button></div></section>`;
                document.body.appendChild(modal);
            },

            cancelImportPreview() {
                this.state.importPreview = null;
                document.getElementById('import-preview-modal')?.remove();
            },

            confirmImportData() {
                const preview = this.state.importPreview;
                if (!preview) return;
                const known = new Set(this.state.problems.map(p => p.title.toLowerCase()));
                const knownIds = new Set(this.state.problems.map(p => p.id));
                let added = 0;
                preview.problems.forEach(p => {
                    const key = p.title.toLowerCase();
                    if (known.has(key)) return;
                    const desiredId = p.id && !knownIds.has(p.id) ? p.id : null;
                    this.addProblem(p, true);
                    const savedProblem = this.state.problems[this.state.problems.length - 1];
                    if (desiredId) savedProblem.id = desiredId;
                    known.add(key);
                    knownIds.add(savedProblem.id);
                    added++;
                });
                if (preview.stats) {
                    const oldAttempts = this.state.stats.attempts || [];
                    const importedAttempts = preview.stats.attempts || [];
                    const signatures = new Set(oldAttempts.map(a => `${a.problemId}:${a.at}`));
                    this.state.stats = { ...this.state.stats, ...preview.stats, attempts: [...oldAttempts, ...importedAttempts.filter(a => !signatures.has(`${a.problemId}:${a.at}`))], drafts: { ...(this.state.stats.drafts || {}), ...(preview.stats.drafts || {}) } };
                }
                this.state.stats.attempts ||= [];
                this.state.stats.drafts ||= {};
                this.saveData();
                this.cancelImportPreview();
                this.showToast(`Imported ${added} new problems and merged saved progress.`, 'success');
                this.navigate('dashboard');
            },

            getDueProblems() {
                const now = Date.now();
                return this.state.problems.filter(p => p.nextReviewDate <= now);
            },

            getFilteredPracticePool() {
                let pool = this.state.practiceState.mode === 'due' ? this.getDueProblems() : [...this.state.problems];
                const { filterTopic, filterSubTopic, filterDifficulty } = this.state.practiceState;

                if (filterTopic && filterTopic !== 'ALL') {
                    pool = pool.filter(p => (p.topic || 'General') === filterTopic);
                }
                if (filterSubTopic && filterSubTopic !== 'ALL') {
                    pool = pool.filter(p => (p.subTopic || '') === filterSubTopic);
                }
                if (filterDifficulty && filterDifficulty !== 'ALL') {
                    pool = pool.filter(p => p.difficulty === filterDifficulty);
                }
                return pool;
            },

            rateProblem(ratingType) {
                const problem = this.state.practiceState.activeProblem;
                if (!problem) return;

                if (ratingType === 'practice_again') {
                    this.state.practiceState.step = 0;
                    this.state.practiceState.scratchpad = this.getStarterTemplate(this.state.practiceState.language);
                    this.resetTimer();
                    this.renderPracticeWorkspace();
                    this.showToast('Resetting problem for immediate re-attempt!', 'info');
                    return;
                }

                const outcome = document.getElementById('attempt-outcome')?.value || 'independent';
                const reflection = document.getElementById('attempt-reflection')?.value.trim() || '';
                const daysToAdd = this.calculateReviewInterval(problem, ratingType, outcome);
                this.state.stats.attempts ||= [];
                this.state.stats.attempts.push({
                    problemId: problem.id, title: problem.title, topic: problem.topic || 'General',
                    outcome, rating: ratingType, reflection, at: Date.now(),
                    seconds: Math.max(0, this.state.practiceState.timerValue - this.state.practiceState.timeLeft)
                });
                if (this.state.stats.attempts.length > 5000) this.state.stats.attempts.splice(0, this.state.stats.attempts.length - 5000);
                problem.reviewCount = (problem.reviewCount || 0) + 1;
                problem.lastOutcome = outcome;
                problem.intervalDays = daysToAdd;
                problem.nextReviewDate = Date.now() + daysToAdd * 86400000;
                this.state.practiceState.sessionCompleted += 1;
                this.state.stats.sessionCompleted = this.state.practiceState.sessionCompleted;
                this.markSeen(problem.id);
                if (this.state.practiceState.sessionCompleted === this.state.practiceState.sessionTarget) this.showToast('Session goal reached. Great work—keep going or take a break.', 'success');

                this.checkDailyReset();
                if (outcome === 'independent') this.state.stats.solvedToday += 1;
                
                const index = this.state.problems.findIndex(p => p.id === problem.id);
                if (index !== -1) {
                    this.state.problems[index] = problem;
                }

                this.saveData();
                this.showToast(`Scheduled review: ${daysToAdd === 0 ? 'Today' : 'in ' + daysToAdd + ' days'}`, 'success');
                this.stopTimer();
                this.loadNextPracticeProblem();
            },

            calculateReviewInterval(problem, rating, outcome) {
                if (rating === 'again' || outcome === 'solution') {
                    problem.easeFactor = Math.max(1.3, (problem.easeFactor || 2.3) - 0.2);
                    return 0;
                }
                const previous = problem.intervalDays || 0;
                const ease = problem.easeFactor || 2.3;
                let interval;
                if (rating === 'hard') interval = previous ? Math.max(1, Math.round(previous * 1.2)) : 2;
                else if (rating === 'good') interval = previous ? Math.max(1, Math.round(previous * ease)) : 5;
                else interval = previous ? Math.max(1, Math.round(previous * ease * 1.3)) : 12;
                if (outcome === 'hint') interval = Math.max(1, Math.round(interval * 0.6));
                if (outcome === 'independent') interval = Math.max(interval, rating === 'easy' ? 12 : rating === 'good' ? 5 : 2);
                const adjustment = rating === 'easy' ? 0.15 : rating === 'hard' ? -0.15 : 0;
                problem.easeFactor = Math.max(1.3, Math.min(3.0, ease + adjustment + (outcome === 'solution' ? -0.2 : outcome === 'independent' ? 0.05 : 0)));
                return Math.min(interval, 365);
            },

            markSeen(id) {
                const ps = this.state.practiceState;
                ps.seenThisSession ||= [];
                if (!ps.seenThisSession.includes(id)) ps.seenThisSession.push(id);
                this.state.stats.seenThisSession = ps.seenThisSession;
            },

            skipActiveProblem() {
                const p = this.state.practiceState.activeProblem;
                if (!p) return;
                const reason = window.prompt('Why are you skipping this problem? (optional)', 'Stuck or time ran out');
                if (reason === null) return;
                this.state.stats.attempts ||= [];
                this.state.stats.attempts.push({ problemId: p.id, title: p.title, topic: p.topic || 'General', outcome: 'skipped', rating: 'skip', reflection: reason.trim() || 'Skipped during practice session', at: Date.now(), seconds: Math.max(0, this.state.practiceState.timerValue - this.state.practiceState.timeLeft) });
                if (this.state.stats.attempts.length > 5000) this.state.stats.attempts.splice(0, this.state.stats.attempts.length - 5000);
                this.markSeen(p.id);
                this.saveData();
                this.stopTimer();
                this.loadNextPracticeProblem();
            },

            resetPracticeSession() {
                this.state.practiceState.sessionCompleted = 0;
                this.state.practiceState.seenThisSession = [];
                this.state.stats.sessionCompleted = 0;
                this.state.stats.seenThisSession = [];
                this.saveData();
                this.showToast('Practice session reset.', 'info');
                this.loadNextPracticeProblem();
            },

            practiceSpecificProblem(id) {
                const prob = this.state.problems.find(p => p.id === id);
                if (!prob) return;
                this.state.practiceState.mode = 'random';
                this.state.practiceState.filterTopic = 'ALL';
                this.state.practiceState.filterSubTopic = 'ALL';
                this.state.practiceState.filterDifficulty = 'ALL';
                this.navigate('practice', prob);
            },

            practiceTopicSet(topic, subTopic = 'ALL') {
                this.state.practiceState.mode = 'random';
                this.state.practiceState.filterTopic = topic;
                this.state.practiceState.filterSubTopic = subTopic;
                this.state.practiceState.filterDifficulty = 'ALL';
                this.navigate('practice');
            },

            // Timer Controls
            setTimerDuration(minutes) {
                this.stopTimer();
                this.state.practiceState.timerValue = minutes * 60;
                this.state.practiceState.timeLeft = minutes * 60;
                this.updateTimerDisplay();
                this.updateTimerControlsUI();
            },

            startTimer() {
                if (this.state.practiceState.timerRunning) return;
                this.state.practiceState.timerRunning = true;
                this.updateTimerControlsUI();
                this.state.practiceState.timerInterval = setInterval(() => {
                    if (this.state.practiceState.timeLeft > 0) {
                        this.state.practiceState.timeLeft--;
                        this.updateTimerDisplay();
                    } else {
                        this.stopTimer();
                        this.playAlarm();
                        this.showToast("Time's up! Review your attempt or reveal the hint.", 'error');
                    }
                }, 1000);
            },

            stopTimer() {
                this.state.practiceState.timerRunning = false;
                if (this.state.practiceState.timerInterval) {
                    clearInterval(this.state.practiceState.timerInterval);
                    this.state.practiceState.timerInterval = null;
                }
                this.updateTimerControlsUI();
            },

            resetTimer() {
                this.stopTimer();
                this.state.practiceState.timeLeft = this.state.practiceState.timerValue;
                this.updateTimerDisplay();
            },

            updateTimerDisplay() {
                const el = document.getElementById('timer-display');
                if (!el) return;
                const mins = Math.floor(this.state.practiceState.timeLeft / 60);
                const secs = this.state.practiceState.timeLeft % 60;
                el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                if (this.state.practiceState.timeLeft <= 60 && this.state.practiceState.timeLeft > 0) {
                    el.classList.add('text-red-400');
                    el.classList.remove('text-white');
                } else {
                    el.classList.remove('text-red-400');
                    el.classList.add('text-white');
                }
            },

            updateTimerControlsUI() {
                const container = document.getElementById('timer-controls');
                if (!container) return;
                if (this.state.practiceState.timerRunning) {
                    container.innerHTML = `
                        <button onclick="app.stopTimer()" title="Pause" class="bg-yellow-600 hover:bg-yellow-500 text-white px-2.5 py-1 rounded text-xs font-bold"><i class="fa-solid fa-pause"></i></button>
                        <button onclick="app.resetTimer()" title="Reset" class="bg-gray-700 hover:bg-gray-600 text-gray-200 px-2.5 py-1 rounded text-xs"><i class="fa-solid fa-rotate-right"></i></button>
                    `;
                } else {
                    container.innerHTML = `
                        <button onclick="app.startTimer()" title="Start" class="bg-green-600 hover:bg-green-500 text-white px-2.5 py-1 rounded text-xs font-bold"><i class="fa-solid fa-play"></i></button>
                        <button onclick="app.resetTimer()" title="Reset" class="bg-gray-700 hover:bg-gray-600 text-gray-200 px-2.5 py-1 rounded text-xs"><i class="fa-solid fa-rotate-right"></i></button>
                    `;
                }
            },

            playAlarm() {
                try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(880, ctx.currentTime);
                    gain.gain.setValueAtTime(0.3, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.8);
                } catch (e) { console.log('Audio alert blocked'); }
            },

            navigate(view, specificProblem = null) {
                this.state.currentView = view;
                this.stopTimer(); 
                const content = document.getElementById('app-content');
                content.innerHTML = '';

                ['dashboard', 'practice', 'add'].forEach(v => {
                    const btn = document.getElementById(`nav-${v}`);
                    if (btn) {
                        btn.className = v === view
                            ? "px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 bg-gray-800 text-white border border-gray-700"
                            : "px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 text-gray-300 hover:bg-gray-800 hover:text-white";
                    }
                });

                switch (view) {
                    case 'dashboard': this.renderDashboard(content); break;
                    case 'add': this.renderAddForm(content); break;
                    case 'practice': this.initPracticeArena(content, specificProblem); break;
                }
            },

            renderDashboard(container) {
                const dueCount = this.getDueProblems().length;
                const totalCount = this.state.problems.length;
                this.checkDailyReset();
                const attempts = this.state.stats.attempts || [];
                const today = new Date().toDateString();
                const todayIndependent = attempts.filter(a => new Date(a.at).toDateString() === today && a.outcome === 'independent').length;
                const recent = attempts.filter(a => a.at >= Date.now() - 30 * 86400000);
                const independentRate = recent.length ? Math.round(recent.filter(a => a.outcome === 'independent').length * 100 / recent.length) : null;
                const upcomingCount = this.state.problems.filter(p => p.nextReviewDate > Date.now() && p.nextReviewDate <= Date.now() + 7 * 86400000).length;
                const topicPerformance = {};
                attempts.filter(a => a.outcome !== 'skipped').forEach(a => {
                    const topic = a.topic || 'General';
                    topicPerformance[topic] ||= { total: 0, independent: 0 };
                    topicPerformance[topic].total++;
                    if (a.outcome === 'independent') topicPerformance[topic].independent++;
                });
                const topicRows = Object.entries(topicPerformance).map(([topic, s]) => ({ topic, total: s.total, rate: Math.round(100 * s.independent / s.total) })).sort((a, b) => a.rate - b.rate || b.total - a.total);

                const topicsMap = {};
                this.state.problems.forEach(p => {
                    const t = p.topic || 'General';
                    if (!topicsMap[t]) topicsMap[t] = new Set();
                    if (p.subTopic) topicsMap[t].add(p.subTopic);
                });

                container.innerHTML = `
                    <div class="space-y-6 w-full max-w-6xl mx-auto">
                        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 flex items-center space-x-4">
                                <div class="bg-blue-900/50 p-4 rounded-full text-blue-400"><i class="fa-solid fa-layer-group text-2xl"></i></div>
                                <div><p class="text-sm text-gray-400">Total Bank</p><p class="text-3xl font-bold text-white">${totalCount}</p></div>
                            </div>
                            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 flex items-center space-x-4">
                                <div class="bg-red-900/50 p-4 rounded-full text-red-400"><i class="fa-solid fa-clock text-2xl"></i></div>
                                <div><p class="text-sm text-gray-400">Due Today</p><p class="text-3xl font-bold text-white">${dueCount}</p></div>
                            </div>
                            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 flex items-center space-x-4">
                                <div class="bg-green-900/50 p-4 rounded-full text-green-400"><i class="fa-solid fa-fire text-2xl"></i></div>
                                <div><p class="text-sm text-gray-400">Independent Today</p><p class="text-3xl font-bold text-white">${todayIndependent}</p><p class="text-xs text-gray-500">solved without help</p></div>
                            </div>
                            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 flex items-center space-x-4">
                                <div class="bg-purple-900/50 p-4 rounded-full text-purple-400"><i class="fa-solid fa-bullseye text-2xl"></i></div>
                                <div><p class="text-sm text-gray-400">Independent Recall</p><p class="text-3xl font-bold text-white">${independentRate === null ? '—' : independentRate + '%'}</p><p class="text-xs text-gray-500">last 30 days · ${recent.length} attempts</p></div>
                            </div>
                        </div>

                        <section class="bg-gray-800 rounded-xl border border-gray-700 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div><h2 class="font-bold text-white">Your next study session</h2><p class="text-sm text-gray-400 mt-1">${dueCount} reviews due now · ${upcomingCount} more due in the next 7 days${topicRows.length ? ` · Focus area: ${this.escapeHTML(topicRows[0].topic)} (${topicRows[0].rate}% independent)` : ''}</p></div>
                            <button onclick="app.navigate('practice'); app.setPracticeMode('due')" class="shrink-0 bg-primary hover:bg-primary_dark text-white px-5 py-2.5 rounded-lg font-bold">Start due reviews</button>
                        </section>

                        ${Object.keys(topicsMap).length > 0 ? `
                        <div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
                            <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3"><i class="fa-solid fa-sitemap text-primary mr-2"></i>Quick Practice by Topic</h3>
                            <div class="flex flex-wrap gap-2">
                                ${Object.keys(topicsMap).sort().map(topic => `
                                    <button onclick="app.practiceTopicSet('${this.escapeHTML(topic).replace(/'/g, "\\'")}')" class="bg-gray-900 hover:bg-primary/20 border border-gray-700 hover:border-primary text-gray-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-2">
                                        <span>${this.escapeHTML(topic)}</span>
                                        <span class="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded text-[10px]">${this.state.problems.filter(p => (p.topic || 'General') === topic).length}</span>
                                    </button>
                                `).join('')}
                            </div>
                        </div>` : ''}

                        ${attempts.length ? `
                        <section class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                            <div class="px-5 py-4 border-b border-gray-700 flex items-center justify-between"><div><h3 class="font-bold text-white">Recent practice</h3><p class="text-xs text-gray-400">Your attempts and reflections</p></div><span class="text-xs text-gray-400">${attempts.length} saved</span></div>
                            <div class="divide-y divide-gray-700">${attempts.slice(-5).reverse().map(a => `<article class="px-5 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1"><div><p class="text-sm text-white font-medium">${this.escapeHTML(a.title)}</p><p class="text-xs text-gray-400">${this.escapeHTML(a.topic || 'General')} · ${new Date(a.at).toLocaleDateString()}</p>${a.reflection ? `<p class="text-sm text-gray-300 mt-1">${this.escapeHTML(a.reflection)}</p>` : ''}</div><span class="text-xs rounded-full px-2 py-1 self-start ${a.outcome === 'independent' ? 'bg-green-900/50 text-green-300' : a.outcome === 'hint' ? 'bg-yellow-900/50 text-yellow-300' : a.outcome === 'skipped' ? 'bg-gray-700 text-gray-300' : 'bg-red-900/50 text-red-300'}">${a.outcome === 'independent' ? 'Independent' : a.outcome === 'hint' ? 'Hint used' : a.outcome === 'skipped' ? 'Skipped' : 'Solution needed'}</span></article>`).join('')}</div>
                        </section>` : `<div class="bg-gray-800/60 rounded-xl border border-dashed border-gray-700 p-5 text-sm text-gray-400">After your first practice session, this space will show your attempts and reflections. Export a JSON backup periodically to keep a copy outside this browser.</div>`}

                        ${topicRows.length ? `<section class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"><div class="px-5 py-4 border-b border-gray-700"><h3 class="font-bold text-white">Topic confidence</h3><p class="text-xs text-gray-400">Based on attempts logged in this trainer</p></div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">${topicRows.map(row => { const color = row.rate < 40 ? '#ef4444' : row.rate < 70 ? '#eab308' : '#22c55e'; return `<button onclick="app.practiceTopicSet('${this.escapeHTML(row.topic).replace(/'/g, "\\'")}')" class="text-left bg-gray-900 border border-gray-700 rounded-lg p-3 hover:border-primary"><span class="text-sm text-white font-semibold">${this.escapeHTML(row.topic)}</span><span class="block text-xs text-gray-400 mt-1">${row.rate}% independent · ${row.total} attempts</span><span class="block h-1.5 bg-gray-700 rounded-full mt-2 overflow-hidden"><span class="block h-full rounded-full" style="width:${row.rate}%;background-color:${color}"></span></span></button>`; }).join('')}</div></section>` : ''}

                        <div class="rounded-xl border border-amber-800/60 bg-amber-950/30 px-5 py-4 text-sm text-amber-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <p><strong>Progress is saved automatically in this browser.</strong> Browser resets or switching devices can remove or hide local data, so download a JSON backup and keep it somewhere safe.</p>
                            <button onclick="app.exportData()" class="shrink-0 px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded-lg font-semibold">Download backup</button>
                        </div>

                        <div class="flex flex-wrap gap-4 justify-between items-center bg-gray-800 p-4 rounded-xl border border-gray-700">
                            <div class="flex items-center space-x-2">
                                <input type="search" id="bank-search" aria-label="Search problem bank" oninput="app.filterBankTable()" placeholder="Search title, topic, or sub-topic..." class="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-primary outline-none w-full sm:w-64">
                            </div>
                            <div class="flex gap-3">
                                <button onclick="app.exportData()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm font-medium flex items-center space-x-2"><i class="fa-solid fa-download"></i> <span>Export JSON</span></button>
                                <label class="cursor-pointer px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm font-medium flex items-center space-x-2">
                                    <i class="fa-solid fa-upload"></i> <span>Import JSON</span>
                                    <input type="file" accept=".json" class="hidden" onchange="app.importData(event)">
                                </label>
                                <button onclick="app.openClearAllModal()" class="px-4 py-2 bg-red-900/60 hover:bg-red-700 text-red-200 border border-red-800/60 rounded-md text-sm font-medium flex items-center space-x-2"><i class="fa-solid fa-trash-can"></i> <span>Clear All</span></button>
                            </div>
                        </div>
                        
                        <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                            <div class="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
                                <div><h2 class="text-lg font-bold text-white">Your Problem Bank</h2><p class="text-xs text-gray-400 mt-1">${attempts.length} practice attempts saved · local auto-backup active</p></div>
                                <button onclick="app.exportData()" class="text-xs text-blue-300 hover:text-white">Download a portable backup</button>
                            </div>
                            ${this.state.problems.length === 0 ? 
                                `<div class="p-8 text-center text-gray-400"><p>No problems added yet. Click 'Add Problem' to start.</p></div>` :
                                `<div class="overflow-x-auto"><table class="w-full text-sm text-left" id="problem-bank-table">
                                    <thead class="text-xs text-gray-400 uppercase bg-gray-900/50">
                                        <tr>
                                            <th class="px-6 py-3">Title</th>
                                            <th class="px-6 py-3">Difficulty</th>
                                            <th class="px-6 py-3">Main Topic & Sub-Topic</th>
                                            <th class="px-6 py-3">Status</th>
                                            <th class="px-6 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-gray-700">
                                        ${this.state.problems.map(p => `
                                            <tr class="hover:bg-gray-750 bg-gray-800 problem-row" data-search="${this.escapeHTML((p.title + ' ' + (p.topic || '') + ' ' + (p.subTopic || '')).toLowerCase())}">
                                                <td class="px-6 py-4 font-medium text-white">
                                                    <div class="flex items-center space-x-2">
                                                        <span>${this.escapeHTML(p.title)}</span>
                                                        <a href="${this.escapeHTML(p.leetcodeUrl || this.generateLeetCodeUrl(p.title))}" target="_blank" rel="noopener noreferrer" title="Open on LeetCode" class="text-yellow-500 hover:text-yellow-400 text-xs">
                                                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                                                        </a>
                                                    </div>
                                                </td>
                                                <td class="px-6 py-4"><span class="px-2.5 py-0.5 rounded-full text-xs font-medium ${p.difficulty === 'Easy' ? 'bg-green-900/50 text-green-400' : p.difficulty === 'Medium' ? 'bg-yellow-900/50 text-yellow-400' : 'bg-red-900/50 text-red-400'}">${p.difficulty}</span></td>
                                                <td class="px-6 py-4">
                                                    <div class="flex flex-wrap items-center gap-1.5">
                                                        <span class="bg-blue-900/40 text-blue-300 border border-blue-800/50 px-2 py-0.5 rounded text-xs font-medium">${this.escapeHTML(p.topic || 'General')}</span>
                                                        ${p.subTopic ? `<span class="text-gray-500 text-xs">→</span><span class="bg-purple-900/40 text-purple-300 border border-purple-800/50 px-2 py-0.5 rounded text-xs">${this.escapeHTML(p.subTopic)}</span>` : ''}
                                                    </div>
                                                </td>
                                                <td class="px-6 py-4">${p.nextReviewDate <= Date.now() ? '<span class="text-red-400 font-medium">Due</span>' : '<span class="text-green-400 font-medium">Scheduled</span>'}</td>
                                                <td class="px-6 py-4 text-right space-x-3 whitespace-nowrap">
                                                    <button onclick="app.practiceSpecificProblem('${p.id}')" title="Practice Now" class="text-green-400 hover:text-green-300"><i class="fa-solid fa-play"></i></button>
                                                    <button onclick="app.openEditModal('${p.id}')" title="Edit Topic / Details" class="text-blue-400 hover:text-blue-300"><i class="fa-solid fa-pen-to-square"></i></button>
                                                    <button onclick="app.deleteProblem('${p.id}')" title="Delete" class="text-gray-500 hover:text-red-400"><i class="fa-solid fa-trash"></i></button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table></div>`
                            }
                        </div>
                    </div>

                    <!-- Clear All Confirmation Modal -->
                    <div id="clear-all-modal" class="fixed inset-0 bg-black/75 z-50 hidden flex items-center justify-center p-4">
                        <div class="bg-gray-800 border border-gray-700 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                            <div class="flex items-center space-x-3 text-red-400">
                                <i class="fa-solid fa-triangle-exclamation text-2xl"></i>
                                <h3 class="text-lg font-bold text-white">Delete All Problems?</h3>
                            </div>
                            <p class="text-sm text-gray-300">This will permanently delete all <strong>${totalCount}</strong> problems from your local browser storage. Make sure you have exported a JSON backup first if you want to keep them.</p>
                            <div class="flex justify-end space-x-3 pt-2">
                                <button onclick="app.closeClearAllModal()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">Cancel</button>
                                <button onclick="app.clearAllProblems()" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold">Yes, Delete All</button>
                            </div>
                        </div>
                    </div>

                    ${this.renderEditModalHTML()}
                    ${this.renderDatalists()}
                `;
            },

            renderEditModalHTML() {
                return `
                    <!-- Edit Modal -->
                    <div id="edit-modal" class="fixed inset-0 bg-black/75 z-50 hidden flex items-center justify-center p-4">
                        <div class="bg-gray-800 border border-gray-700 rounded-xl max-w-3xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
                            <div class="flex justify-between items-center border-b border-gray-700 pb-3">
                                <h3 class="text-lg font-bold text-white"><i class="fa-solid fa-pen-to-square text-primary mr-2"></i>Edit Problem Statement, Tags & Solution</h3>
                                <button onclick="app.closeEditModal()" class="text-gray-400 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>
                            </div>
                            <form id="edit-problem-form" onsubmit="event.preventDefault(); app.saveEditedProblem()" class="space-y-4">
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-xs font-medium text-gray-400 mb-1">Title</label>
                                        <input type="text" id="edit-title" required class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-medium text-gray-400 mb-1">Difficulty</label>
                                        <select id="edit-diff" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
                                            <option value="Easy">Easy</option>
                                            <option value="Medium">Medium</option>
                                            <option value="Hard">Hard</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-400 mb-1">LeetCode Problem URL</label>
                                    <input type="url" id="edit-url" placeholder="https://leetcode.com/problems/..." class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-yellow-300 font-mono">
                                </div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-xs font-medium text-gray-400 mb-1">Main Topic (e.g. Arrays, Trees)</label>
                                        <input type="text" id="edit-topic" list="existing-topics" required class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-medium text-gray-400 mb-1">Sub-Topic / Pattern (e.g. Prefix Sum)</label>
                                        <input type="text" id="edit-subtopic" list="existing-subtopics" placeholder="Optional sub-pattern..." class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-400 mb-1">Problem Statement, Examples & Constraints</label>
                                    <textarea id="edit-statement" rows="7" required class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 font-sans leading-relaxed"></textarea>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-400 mb-1">Pattern Hint (1-line trigger)</label>
                                    <input type="text" id="edit-hint" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-blue-200">
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-400 mb-1">Optimal Solution Code</label>
                                    <textarea id="edit-code" rows="6" class="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-green-400 font-mono"></textarea>
                                </div>
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-xs font-medium text-gray-400 mb-1">Time Complexity</label>
                                        <input type="text" id="edit-time" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white font-mono">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-medium text-gray-400 mb-1">Space Complexity</label>
                                        <input type="text" id="edit-space" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white font-mono">
                                    </div>
                                </div>
                                <div class="flex justify-end space-x-3 pt-3 border-t border-gray-700">
                                    <button type="button" onclick="app.closeEditModal()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">Cancel</button>
                                    <button type="submit" class="px-5 py-2 bg-primary hover:bg-primary_dark text-white rounded-lg text-sm font-bold">Save Changes</button>
                                </div>
                            </form>
                        </div>
                    </div>
                `;
            },

            renderDatalists() {
                const topics = [...new Set(this.state.problems.map(p => p.topic).filter(Boolean))];
                const subTopics = [...new Set(this.state.problems.map(p => p.subTopic).filter(Boolean))];
                return `
                    <datalist id="existing-topics">${topics.map(t => `<option value="${this.escapeHTML(t)}">`).join('')}</datalist>
                    <datalist id="existing-subtopics">${subTopics.map(st => `<option value="${this.escapeHTML(st)}">`).join('')}</datalist>
                `;
            },

            filterBankTable() {
                const query = document.getElementById('bank-search').value.toLowerCase();
                document.querySelectorAll('.problem-row').forEach(row => {
                    const text = row.getAttribute('data-search');
                    row.style.display = text.includes(query) ? '' : 'none';
                });
            },

            openEditModal(id) {
                const p = this.state.problems.find(prob => prob.id === id);
                if (!p) return;
                this.state.editingProblemId = id;
                document.getElementById('edit-title').value = p.title || '';
                document.getElementById('edit-url').value = p.leetcodeUrl || this.generateLeetCodeUrl(p.title);
                document.getElementById('edit-diff').value = p.difficulty || 'Medium';
                document.getElementById('edit-topic').value = p.topic || p.pattern || 'General';
                document.getElementById('edit-subtopic').value = p.subTopic || '';
                document.getElementById('edit-statement').value = p.statement || '';
                document.getElementById('edit-hint').value = p.hint || '';
                document.getElementById('edit-code').value = p.solutionCode || '';
                document.getElementById('edit-time').value = p.timeComplexity || 'O(?)';
                document.getElementById('edit-space').value = p.spaceComplexity || 'O(?)';
                document.getElementById('edit-modal').classList.remove('hidden');
            },

            closeEditModal() {
                this.state.editingProblemId = null;
                document.getElementById('edit-modal').classList.add('hidden');
            },

            saveEditedProblem() {
                if (!this.state.editingProblemId) return;
                const titleVal = document.getElementById('edit-title').value.trim();
                const urlVal = document.getElementById('edit-url').value.trim();
                this.updateProblemDetails(this.state.editingProblemId, {
                    title: titleVal,
                    leetcodeUrl: urlVal || this.generateLeetCodeUrl(titleVal),
                    difficulty: document.getElementById('edit-diff').value,
                    topic: document.getElementById('edit-topic').value.trim(),
                    subTopic: document.getElementById('edit-subtopic').value.trim(),
                    statement: document.getElementById('edit-statement').value,
                    hint: document.getElementById('edit-hint').value.trim(),
                    solutionCode: document.getElementById('edit-code').value,
                    timeComplexity: document.getElementById('edit-time').value.trim(),
                    spaceComplexity: document.getElementById('edit-space').value.trim()
                });
                this.closeEditModal();
                if (this.state.currentView === 'dashboard') {
                    this.renderDashboard(document.getElementById('app-content'));
                } else if (this.state.currentView === 'practice' && this.state.practiceState.activeProblem) {
                    this.state.practiceState.activeProblem = this.state.problems.find(p => p.id === this.state.practiceState.activeProblem.id);
                    this.renderPracticeWorkspace();
                }
            },

            renderAddForm(container) {
                const mode = this.state.addMode;
                container.innerHTML = `
                    <div class="max-w-4xl mx-auto w-full bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-xl">
                        <div class="px-6 py-4 border-b border-gray-700 bg-gray-850 flex flex-wrap justify-between items-center gap-4">
                            <h2 class="text-xl font-bold text-white"><i class="fa-solid fa-plus-circle text-primary mr-2"></i>Add New Problems</h2>
                            <div class="flex bg-gray-900 p-1 rounded-lg border border-gray-700">
                                <button onclick="app.setAddMode('manual')" class="px-4 py-1.5 rounded-md text-sm font-medium ${mode === 'manual' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}">Manual Entry</button>
                                <button onclick="app.setAddMode('bulk')" class="px-4 py-1.5 rounded-md text-sm font-medium ${mode === 'bulk' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}"><i class="fa-solid fa-wand-magic-sparkles text-primary mr-1"></i> Smart Paste</button>
                            </div>
                        </div>
                        ${mode === 'manual' ? `
                        <form id="add-problem-form" class="p-6 space-y-6" onsubmit="event.preventDefault(); app.submitProblemForm()">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div class="space-y-2"><label class="block text-sm font-medium text-gray-300">Problem Title</label><input type="text" id="p-title" required placeholder="e.g., Subarray Sum Equals K" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white"></div>
                                <div class="space-y-2"><label class="block text-sm font-medium text-gray-300">Difficulty</label><select id="p-diff" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white"><option value="Easy">Easy</option><option value="Medium">Medium</option><option value="Hard">Hard</option></select></div>
                            </div>
                            <div class="space-y-2"><label class="block text-sm font-medium text-gray-300">LeetCode URL (Optional - auto-generated from title if left blank)</label><input type="url" id="p-url" placeholder="https://leetcode.com/problems/subarray-sum-equals-k/" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-yellow-300 font-mono text-sm"></div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div class="space-y-2"><label class="block text-sm font-medium text-gray-300">Main Topic</label><input type="text" id="p-topic" list="existing-topics" required placeholder="e.g., Arrays" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white"></div>
                                <div class="space-y-2"><label class="block text-sm font-medium text-gray-300">Sub-Topic / Pattern</label><input type="text" id="p-subtopic" list="existing-subtopics" placeholder="e.g., Prefix Sum (Optional)" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white"></div>
                            </div>
                            <div class="space-y-2"><label class="block text-sm font-medium text-gray-300">Statement & Examples</label><textarea id="p-statement" required rows="6" placeholder="Paste problem description, examples, and constraints..." class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white"></textarea></div>
                            <div class="space-y-2"><label class="block text-sm font-medium text-gray-300">Pattern Hint (1-line trigger)</label><input type="text" id="p-hint" required placeholder="e.g., Use a Hash Map to store prefix sums and check for (currentSum - k)." class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-blue-200"></div>
                            <div class="space-y-2"><label class="block text-sm font-medium text-gray-300">Optimal Solution Code</label><textarea id="p-code" required rows="8" placeholder="// Paste your optimal solution code..." class="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-green-400 font-mono text-sm"></textarea></div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div class="space-y-2"><label class="block text-sm font-medium text-gray-300">Time Complexity</label><input type="text" id="p-time" required placeholder="e.g., O(n)" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white font-mono"></div>
                                <div class="space-y-2"><label class="block text-sm font-medium text-gray-300">Space Complexity</label><input type="text" id="p-space" required placeholder="e.g., O(n)" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white font-mono"></div>
                            </div>
                            <div class="pt-4 border-t border-gray-700 flex justify-end"><button type="submit" class="bg-primary hover:bg-primary_dark text-white px-6 py-2.5 rounded-lg font-bold">Save Problem</button></div>
                        </form>
                        ${this.renderDatalists()}` : `
                        <div class="p-6 space-y-4">
                            <div class="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 text-sm text-blue-200">
                                <p class="font-semibold mb-1"><i class="fa-solid fa-circle-info mr-1"></i> How Smart Paste Works:</p>
                                <p class="text-blue-300/90">Paste a raw list of problems below. It automatically detects <strong>Topic: ...</strong> or <strong>Category ::</strong> headings, numbered titles (e.g., <code>1. Two Sum</code>), or unnumbered titles right above problem descriptions.</p>
                            </div>
                            <textarea id="bulk-paste-input" rows="14" oninput="app.state.bulkRaw=this.value" placeholder="Topic: Prefix Sum\n1. Subarray Sum Equals K\nGiven an integer array nums and an integer k...\nExample 1:\n Input: nums = [1,1,1], k = 2\n Output: 2" class="w-full bg-gray-900 border border-gray-600 rounded-lg p-4 text-sm text-gray-200 font-mono focus:border-primary outline-none">${this.escapeHTML(this.state.bulkRaw)}</textarea>
                            <div class="flex justify-end">
                                <button onclick="app.parseBulkProblems()" class="bg-primary hover:bg-primary_dark text-white px-6 py-2.5 rounded-lg font-bold flex items-center space-x-2">
                                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                                    <span>Parse & Add Problems</span>
                                </button>
                            </div>
                            <div id="bulk-preview" class="space-y-3" aria-live="polite"></div>
                        </div>`}
                    </div>
                `;
            },

            setAddMode(mode) {
                this.state.addMode = mode;
                this.renderAddForm(document.getElementById('app-content'));
            },

            submitProblemForm() {
                const titleVal = document.getElementById('p-title').value.trim();
                const urlVal = document.getElementById('p-url').value.trim();
                this.addProblem({
                    title: titleVal,
                    leetcodeUrl: urlVal || this.generateLeetCodeUrl(titleVal),
                    difficulty: document.getElementById('p-diff').value,
                    topic: document.getElementById('p-topic').value.trim(),
                    subTopic: document.getElementById('p-subtopic').value.trim(),
                    statement: document.getElementById('p-statement').value,
                    hint: document.getElementById('p-hint').value,
                    solutionCode: document.getElementById('p-code').value,
                    timeComplexity: document.getElementById('p-time').value,
                    spaceComplexity: document.getElementById('p-space').value,
                });
            },

            parseBulkProblems() {
                const rawText = document.getElementById('bulk-paste-input').value;
                this.state.bulkRaw = rawText;
                if (!rawText.trim()) {
                    this.showToast('Please paste some problems first.', 'error');
                    return;
                }

                const lines = rawText.split('\n');
                const problems = [];
                let currentCategory = 'General';
                let currentProblem = null;

                const descStarters = /^(Given|You are given|Design|Implement|Determine|Write|There (are|is)|After|An array|A number|A path|Koko|A conveyor|Roman numerals|Implement)/i;

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const trimmed = line.trim();

                    // Detect Category/Topic headings
                    const topicMatch = trimmed.match(/^(?:Topic:\s*|Category:\s*)([^:]+)$/i);
                    const doubleColonMatch = trimmed.match(/^(.+?)\s*::\s*$/);
                    if (topicMatch) {
                        currentCategory = topicMatch[1].trim();
                        continue;
                    }
                    if (doubleColonMatch) {
                        currentCategory = doubleColonMatch[1].trim();
                        continue;
                    }
                    if (trimmed === 'Strings' && i + 1 < lines.length && (lines[i+1].trim().match(/^\d+\./) || (i + 2 < lines.length && descStarters.test(lines[i+2].trim())))) {
                        currentCategory = 'Strings';
                        continue;
                    }

                    // Check numbered title e.g. "1. Contains Duplicate"
                    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
                    const isInsideSteps = currentProblem && currentProblem.statementLines.some(l => /steps:/i.test(l));

                    if (numberedMatch && !isInsideSteps) {
                        if (currentProblem) problems.push(currentProblem);
                        currentProblem = {
                            title: numberedMatch[1].trim(),
                            topic: currentCategory,
                            subTopic: '',
                            statementLines: []
                        };
                        continue;
                    }

                    // Check unnumbered title (when copy-paste strips numbers): short line followed by blank line(s) + description starter
                    if (trimmed.length > 2 && trimmed.length < 85 && !trimmed.endsWith('.') && !trimmed.endsWith(':') && !trimmed.startsWith('Input') && !trimmed.startsWith('Output') && !trimmed.startsWith('Explanation')) {
                        let nextNonEmptyIdx = i + 1;
                        while (nextNonEmptyIdx < lines.length && lines[nextNonEmptyIdx].trim() === '') {
                            nextNonEmptyIdx++;
                        }
                        if (nextNonEmptyIdx < lines.length && descStarters.test(lines[nextNonEmptyIdx].trim())) {
                            if (currentProblem) problems.push(currentProblem);
                            currentProblem = {
                                title: trimmed,
                                topic: currentCategory,
                                subTopic: '',
                                statementLines: []
                            };
                            continue;
                        }
                    }

                    if (currentProblem) {
                        currentProblem.statementLines.push(line);
                    }
                }
                if (currentProblem) problems.push(currentProblem);

                const ready = problems.map(p => ({ ...p, statement: p.statementLines.join('\n').trim() })).filter(p => p.title && p.statement);
                if (!ready.length) {
                    this.showToast('Could not detect any problems. Check the formatting.', 'error');
                    return;
                }
                this.state.bulkPreview = ready;
                const existingTitles = new Set(this.state.problems.map(p => p.title.trim().toLowerCase()));
                const previewTitles = new Set(existingTitles);
                const duplicateCount = ready.filter(p => { const key = p.title.toLowerCase(); if (previewTitles.has(key)) return true; previewTitles.add(key); return false; }).length;
                document.getElementById('bulk-preview').innerHTML = `
                    <div class="rounded-lg border border-blue-800 bg-blue-950/40 p-4">
                        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h3 class="font-bold text-white">Import preview: ${ready.length} problems</h3><p class="text-xs text-gray-300 mt-1">${duplicateCount} title(s) already exist. Duplicates will be skipped when you confirm.</p></div><div class="flex gap-2"><button onclick="app.cancelBulkPreview()" class="px-3 py-2 rounded-lg bg-gray-700 text-sm text-white">Back to edit</button><button onclick="app.commitBulkPreview()" class="px-3 py-2 rounded-lg bg-primary text-sm font-bold text-white">Add ${ready.length - duplicateCount} new</button></div></div>
                        <div class="overflow-auto max-h-72 mt-4"><table class="w-full text-xs text-left"><thead class="text-gray-400"><tr><th class="p-2">Title</th><th class="p-2">Topic</th><th class="p-2">Statement preview</th><th class="p-2">Status</th></tr></thead><tbody>${ready.map(p => { const key = p.title.toLowerCase(); const duplicate = existingTitles.has(key); existingTitles.add(key); return `<tr class="border-t border-gray-700"><td class="p-2 text-white">${this.escapeHTML(p.title)}</td><td class="p-2 text-gray-300">${this.escapeHTML(p.topic)}</td><td class="p-2 text-gray-400">${this.escapeHTML(p.statement.slice(0, 130))}${p.statement.length > 130 ? '…' : ''}</td><td class="p-2 ${duplicate ? 'text-yellow-300' : 'text-green-300'}">${duplicate ? 'Duplicate' : 'Ready'}</td></tr>`; }).join('')}</tbody></table></div>
                    </div>`;
            },

            commitBulkPreview() {
                const entries = this.state.bulkPreview || [];
                const existing = new Set(this.state.problems.map(p => p.title.trim().toLowerCase()));
                let added = 0;
                entries.forEach(p => {
                    const key = p.title.trim().toLowerCase();
                    if (!key || !p.statement || existing.has(key)) return;
                    this.addProblem({ title: p.title, difficulty: 'Medium', topic: p.topic, subTopic: p.subTopic, statement: p.statement, hint: 'Identify the structural pattern trigger.', solutionCode: '// Add your solution here\nclass Solution {\n    \n}', timeComplexity: 'O(?)', spaceComplexity: 'O(?)' }, true);
                    existing.add(key);
                    added++;
                });
                this.state.bulkPreview = null;
                this.state.bulkRaw = '';
                if (added) this.saveData();
                this.showToast(`Added ${added} problems. Review and complete their hints and solutions.`, added ? 'success' : 'info');
                this.navigate('dashboard');
            },

            cancelBulkPreview() {
                this.state.bulkPreview = null;
                this.renderAddForm(document.getElementById('app-content'));
            },

            initPracticeArena(container, specificProblem = null) {
                const topics = [...new Set(this.state.problems.map(p => p.topic || 'General'))].sort();
                const { mode, filterTopic, filterSubTopic, filterDifficulty } = this.state.practiceState;

                container.innerHTML = `
                    <div class="w-full h-full flex flex-col space-y-4 flex-grow" id="practice-container">
                        <div class="bg-gray-800 rounded-xl p-4 border border-gray-700 flex flex-wrap gap-4 justify-between items-center flex-none">
                            <div class="flex flex-wrap items-center gap-3">
                                <div class="flex flex-wrap gap-1 bg-gray-900 p-1 rounded-lg border border-gray-700">
                                    <button onclick="app.setPracticeMode('due')" id="mode-due" class="px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium ${mode === 'due' ? 'bg-gray-700 text-white' : 'text-gray-400'}">Due Today (<span id="due-count">${this.getDueProblems().length}</span>)</button>
                                    <button onclick="app.setPracticeMode('random')" id="mode-random" class="px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium ${mode === 'random' ? 'bg-gray-700 text-white' : 'text-gray-400'}">Practice Set / All</button>
                                    <button onclick="app.setPracticeMode('interview')" id="mode-interview" aria-label="Start a mixed interview practice set" class="px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium ${mode === 'interview' ? 'bg-gray-700 text-white' : 'text-gray-400'}">Mixed Interview</button>
                                </div>

                                <select id="filter-topic" onchange="app.updatePracticeFilters()" class="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs sm:text-sm text-gray-200 outline-none focus:border-primary">
                                    <option value="ALL">All Topics</option>
                                    ${topics.map(t => `<option value="${this.escapeHTML(t)}" ${filterTopic === t ? 'selected' : ''}>${this.escapeHTML(t)}</option>`).join('')}
                                </select>

                                <select id="filter-subtopic" onchange="app.updatePracticeFilters()" class="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs sm:text-sm text-gray-200 outline-none focus:border-primary">
                                    <option value="ALL">All Sub-Topics</option>
                                </select>

                                <select id="filter-diff" onchange="app.updatePracticeFilters()" class="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs sm:text-sm text-gray-200 outline-none focus:border-primary">
                                    <option value="ALL" ${filterDifficulty === 'ALL' ? 'selected' : ''}>Any Difficulty</option>
                                    <option value="Easy" ${filterDifficulty === 'Easy' ? 'selected' : ''}>Easy</option>
                                    <option value="Medium" ${filterDifficulty === 'Medium' ? 'selected' : ''}>Medium</option>
                                    <option value="Hard" ${filterDifficulty === 'Hard' ? 'selected' : ''}>Hard</option>
                                </select>
                            </div>

                            <div class="flex flex-wrap items-center gap-2 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-700">
                                <label class="sr-only" for="session-target">Problems in this session</label><select id="session-target" onchange="app.updateSessionTarget(this.value)" class="bg-gray-800 text-gray-300 text-xs rounded px-2 py-1 border border-gray-700 outline-none" aria-label="Problems in this session">
                                    ${[3,5,10].map(n => `<option value="${n}" ${this.state.practiceState.sessionTarget === n ? 'selected' : ''}>${n} problems</option>`).join('')}
                                </select>
                                <span id="session-status" class="text-xs text-gray-300">${this.state.practiceState.sessionCompleted}/${this.state.practiceState.sessionTarget} solved</span>
                                <button onclick="app.resetPracticeSession()" class="text-xs text-blue-300 hover:text-white" aria-label="Reset practice session">Reset set</button>
                                <label class="sr-only" for="practice-timer-length">Problem timer duration</label><select id="practice-timer-length" onchange="app.setTimerDuration(parseInt(this.value))" class="bg-gray-800 text-gray-300 text-xs rounded px-2 py-1 border border-gray-700 outline-none" aria-label="Problem timer duration">
                                    <option value="10" ${this.state.practiceState.timerValue === 600 ? 'selected' : ''}>10m</option>
                                    <option value="15" ${this.state.practiceState.timerValue === 900 ? 'selected' : ''}>15m</option>
                                    <option value="25" ${this.state.practiceState.timerValue === 1500 ? 'selected' : ''}>25m</option>
                                </select>
                                <div class="font-mono text-xl font-bold text-white" id="timer-display" role="timer" aria-live="off" aria-label="Problem timer">15:00</div>
                                <div class="flex space-x-1.5" id="timer-controls"></div>
                            </div>
                        </div>
                        <div id="practice-workspace" class="flex-grow flex flex-col lg:flex-row gap-4 h-full"></div>
                    </div>
                    ${this.renderEditModalHTML()}
                    ${this.renderDatalists()}
                `;
                this.populateSubTopicDropdown();
                this.updateTimerDisplay();
                this.updateTimerControlsUI();
                this.updateSessionStatus();
                this.loadNextPracticeProblem(specificProblem);
            },

            populateSubTopicDropdown() {
                const topicSel = document.getElementById('filter-topic');
                const subSel = document.getElementById('filter-subtopic');
                if (!topicSel || !subSel) return;

                const selectedTopic = topicSel.value;
                let relevantProblems = this.state.problems;
                if (selectedTopic !== 'ALL') {
                    relevantProblems = relevantProblems.filter(p => (p.topic || 'General') === selectedTopic);
                }

                const subTopics = [...new Set(relevantProblems.map(p => p.subTopic).filter(Boolean))].sort();
                const currentSub = this.state.practiceState.filterSubTopic;

                subSel.innerHTML = `<option value="ALL">All Sub-Topics (${subTopics.length})</option>` + 
                    subTopics.map(st => `<option value="${this.escapeHTML(st)}" ${currentSub === st ? 'selected' : ''}>${this.escapeHTML(st)}</option>`).join('');
            },

            updatePracticeFilters() {
                const prevTopic = this.state.practiceState.filterTopic;
                this.state.practiceState.filterTopic = document.getElementById('filter-topic').value;
                if (prevTopic !== this.state.practiceState.filterTopic) {
                    this.state.practiceState.filterSubTopic = 'ALL';
                    this.populateSubTopicDropdown();
                } else {
                    this.state.practiceState.filterSubTopic = document.getElementById('filter-subtopic').value;
                }
                this.state.practiceState.filterDifficulty = document.getElementById('filter-diff').value;
                this.loadNextPracticeProblem();
            },

            setPracticeMode(mode) {
                this.state.practiceState.mode = mode;
                if (mode === 'interview') {
                    Object.assign(this.state.practiceState, { filterTopic: 'ALL', filterSubTopic: 'ALL', filterDifficulty: 'ALL', seenThisSession: [] });
                    if (document.getElementById('filter-topic')) document.getElementById('filter-topic').value = 'ALL';
                    if (document.getElementById('filter-diff')) document.getElementById('filter-diff').value = 'ALL';
                    this.populateSubTopicDropdown();
                }
                document.getElementById('mode-due').className = mode === 'due' ? "px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium bg-gray-700 text-white" : "px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium text-gray-400";
                document.getElementById('mode-random').className = mode === 'random' ? "px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium bg-gray-700 text-white" : "px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium text-gray-400";
                document.getElementById('mode-interview').className = mode === 'interview' ? "px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium bg-gray-700 text-white" : "px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium text-gray-400";
                this.loadNextPracticeProblem();
            },

            updateSessionTarget(value) {
                this.state.practiceState.sessionTarget = Number(value) || 3;
                this.state.stats.sessionTarget = this.state.practiceState.sessionTarget;
                this.updateSessionStatus();
                this.saveData();
            },

            updateSessionStatus() {
                const el = document.getElementById('session-status');
                if (el) el.textContent = `${this.state.practiceState.sessionCompleted || 0}/${this.state.practiceState.sessionTarget || 3} solved`;
            },

            loadNextPracticeProblem(specificProblem = null) {
                const ws = document.getElementById('practice-workspace');
                const dueSpan = document.getElementById('due-count');
                if (dueSpan) dueSpan.textContent = this.getDueProblems().length;
                this.updateSessionStatus();

                if (specificProblem) {
                    this.state.practiceState.activeProblem = specificProblem;
                    this.state.practiceState.step = 0;
                    this.restoreDraft(specificProblem);
                    this.resetTimer();
                    this.renderPracticeWorkspace();
                    return;
                }

                const pool = this.getFilteredPracticePool();

                if (pool.length === 0) {
                    this.state.practiceState.activeProblem = null;
                    ws.innerHTML = `
                        <div class="w-full bg-gray-800 rounded-xl border border-gray-700 flex flex-col items-center justify-center p-12 text-center space-y-4">
                            <i class="fa-solid fa-circle-check text-green-500 text-5xl"></i>
                            <h2 class="text-2xl font-bold text-white">No problems match this filter!</h2>
                            <p class="text-gray-400 max-w-md">If you are in "Due Today" mode, switch to <strong>Practice Set / All</strong> to drill problems from this topic multiple times.</p>
                            <div class="flex gap-3">
                                <button onclick="app.setPracticeMode('random')" class="bg-primary hover:bg-primary_dark text-white px-5 py-2 rounded-lg font-medium">Switch to Practice Set / All</button>
                                <button onclick="app.navigate('add')" class="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2 rounded-lg font-medium">Add Problems</button>
                            </div>
                        </div>`;
                    return;
                }

                let candidates = pool.filter(p => !(this.state.practiceState.seenThisSession || []).includes(p.id));
                if (!candidates.length) {
                    this.state.practiceState.seenThisSession = [];
                    candidates = pool;
                    this.showToast('You have seen every problem in this set. Starting a fresh pass.', 'info');
                }

                this.state.practiceState.activeProblem = candidates[Math.floor(Math.random() * candidates.length)];
                this.state.practiceState.step = 0;
                this.restoreDraft(this.state.practiceState.activeProblem);
                this.resetTimer();
                this.renderPracticeWorkspace();
            },

            getStarterTemplate(lang) {
                const templates = {
                    java: 'class Solution {\n    public void solve() {\n        // Write your code here...\n        \n    }\n}',
                    python: 'class Solution:\n    def solve(self):\n        # Write your code here...\n        pass',
                    cpp: 'class Solution {\npublic:\n    void solve() {\n        // Write your code here...\n        \n    }\n};',
                    javascript: '/**\n * @return {void}\n */\nvar solve = function() {\n    // Write your code here...\n    \n};'
                };
                return templates[lang] || '';
            },

            draftKey(problem, language = this.state.practiceState.language) { return `${problem.id}:${language}`; },

            restoreDraft(problem) {
                const key = this.draftKey(problem);
                this.state.practiceState.scratchpad = this.state.stats.drafts?.[key] ?? this.getStarterTemplate(this.state.practiceState.language);
            },

            saveDraft(value) {
                const problem = this.state.practiceState.activeProblem;
                if (!problem) return;
                this.state.practiceState.scratchpad = value;
                this.state.stats.drafts ||= {};
                this.state.stats.drafts[this.draftKey(problem)] = value;
                clearTimeout(this.draftSaveTimeout);
                this.draftSaveTimeout = setTimeout(() => this.saveData(), 500);
            },

            changeIdeLanguage(lang) {
                const oldInput = document.getElementById('scratchpad-input');
                if (oldInput && this.state.practiceState.activeProblem) {
                    this.state.stats.drafts[this.draftKey(this.state.practiceState.activeProblem)] = oldInput.value;
                    this.saveData();
                }
                this.state.practiceState.language = lang;
                const p = this.state.practiceState.activeProblem;
                this.state.practiceState.scratchpad = p ? (this.state.stats.drafts[this.draftKey(p, lang)] ?? this.getStarterTemplate(lang)) : this.getStarterTemplate(lang);
                const input = document.getElementById('scratchpad-input');
                if (input) {
                    input.value = this.state.practiceState.scratchpad;
                    this.updateIdeLineNumbers();
                    this.updateIdeCursorPos();
                }
            },

            resetScratchpadCode() {
                this.state.practiceState.scratchpad = this.getStarterTemplate(this.state.practiceState.language);
                const p = this.state.practiceState.activeProblem;
                if (p) { this.state.stats.drafts[this.draftKey(p)] = this.state.practiceState.scratchpad; this.saveData(); }
                const input = document.getElementById('scratchpad-input');
                if (input) {
                    input.value = this.state.practiceState.scratchpad;
                    this.updateIdeLineNumbers();
                    this.updateIdeCursorPos();
                }
                this.showToast('Editor reset to starter template.', 'info');
            },

            updateIdeLineNumbers() {
                const input = document.getElementById('scratchpad-input');
                const gutter = document.getElementById('ide-line-numbers');
                if (!input || !gutter) return;
                const lineCount = input.value.split('\n').length;
                gutter.innerHTML = Array.from({ length: Math.max(lineCount, 18) }, (_, i) => `<div>${i + 1}</div>`).join('');
            },

            syncIdeScroll() {
                const input = document.getElementById('scratchpad-input');
                const gutter = document.getElementById('ide-line-numbers');
                if (input && gutter) {
                    gutter.scrollTop = input.scrollTop;
                }
            },

            updateIdeCursorPos() {
                const input = document.getElementById('scratchpad-input');
                const statusEl = document.getElementById('ide-cursor-status');
                if (!input || !statusEl) return;
                const textBefore = input.value.substring(0, input.selectionStart);
                const lines = textBefore.split('\n');
                const line = lines.length;
                const col = lines[lines.length - 1].length + 1;
                statusEl.textContent = `Ln ${line}, Col ${col}  |  ${input.value.length} chars`;
            },

            handleIdeKeydown(e) {
                const el = e.target;
                const start = el.selectionStart;
                const end = el.selectionEnd;

                // Tab key -> insert 4 spaces instead of switching focus
                if (e.key === 'Tab') {
                    e.preventDefault();
                    el.value = el.value.substring(0, start) + '    ' + el.value.substring(end);
                    el.selectionStart = el.selectionEnd = start + 4;
                    this.state.practiceState.scratchpad = el.value;
                    this.updateIdeLineNumbers();
                    this.updateIdeCursorPos();
                    return;
                }

                // Enter key -> auto-indent matching previous line + extra indent after '{' or ':'
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const textBefore = el.value.substring(0, start);
                    const currentLine = textBefore.split('\n').pop();
                    const indentMatch = currentLine.match(/^\s*/);
                    let indent = indentMatch ? indentMatch[0] : '';
                    const trimmedBefore = textBefore.trimEnd();
                    if (trimmedBefore.endsWith('{') || trimmedBefore.endsWith(':')) {
                        indent += '    ';
                    }
                    el.value = el.value.substring(0, start) + '\n' + indent + el.value.substring(end);
                    el.selectionStart = el.selectionEnd = start + 1 + indent.length;
                    this.state.practiceState.scratchpad = el.value;
                    this.updateIdeLineNumbers();
                    this.updateIdeCursorPos();
                    return;
                }

                // Auto-close brackets & quotes
                const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
                if (pairs[e.key]) {
                    e.preventDefault();
                    const selectedText = el.value.substring(start, end);
                    el.value = el.value.substring(0, start) + e.key + selectedText + pairs[e.key] + el.value.substring(end);
                    el.selectionStart = start + 1;
                    el.selectionEnd = end + 1;
                    this.state.practiceState.scratchpad = el.value;
                    this.updateIdeCursorPos();
                }
            },

            renderPracticeWorkspace() {
                const ws = document.getElementById('practice-workspace');
                const p = this.state.practiceState.activeProblem;
                if (!ws || !p) return;

                const poolCount = this.getFilteredPracticePool().length;
                const lang = this.state.practiceState.language || 'java';
                const fileNames = { java: 'Solution.java', python: 'solution.py', cpp: 'solution.cpp', javascript: 'solution.js' };

                ws.innerHTML = `
                    <div class="w-full lg:w-1/2 flex flex-col gap-4">
                        <div class="bg-gray-800 rounded-xl border border-gray-700 flex-grow flex flex-col overflow-hidden">
                            <div class="px-6 py-4 border-b border-gray-700 bg-gray-850 flex justify-between items-start gap-2">
                                <div>
                                    <h2 class="text-xl font-bold text-white mb-2">${this.escapeHTML(p.title)}</h2>
                                    <div class="flex flex-wrap items-center gap-2 text-xs">
                                        <span class="px-2 py-0.5 rounded font-medium ${p.difficulty === 'Easy' ? 'bg-green-900/40 text-green-400' : p.difficulty === 'Medium' ? 'bg-yellow-900/40 text-yellow-400' : 'bg-red-900/40 text-red-400'}">${p.difficulty}</span>
                                        <span class="bg-blue-900/40 text-blue-300 border border-blue-800/50 px-2 py-0.5 rounded">${this.escapeHTML(p.topic || 'General')}</span>
                                        ${p.subTopic ? `<span class="bg-purple-900/40 text-purple-300 border border-purple-800/50 px-2 py-0.5 rounded">${this.escapeHTML(p.subTopic)}</span>` : ''}
                                        <a href="${this.escapeHTML(p.leetcodeUrl || this.generateLeetCodeUrl(p.title))}" target="_blank" rel="noopener noreferrer" class="bg-yellow-900/30 hover:bg-yellow-800/50 text-yellow-400 border border-yellow-700/50 px-2 py-0.5 rounded inline-flex items-center space-x-1 transition-colors">
                                            <span>LeetCode</span>
                                            <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                                        </a>
                                    </div>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-xs text-gray-500 hidden sm:inline">Pool: ${poolCount}</span>
                                    <button onclick="app.openEditModal('${p.id}')" title="Edit Statement / Solution" class="bg-gray-700 hover:bg-gray-600 text-blue-300 px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1">
                                        <i class="fa-solid fa-pen-to-square"></i><span>Edit</span>
                                    </button>
                                    <button onclick="app.skipActiveProblem()" title="Record this problem as skipped and continue" aria-label="Skip this problem" class="bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1">
                                        <span>Skip</span> <i class="fa-solid fa-forward-step"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="p-6 overflow-y-auto flex-grow text-gray-300 text-sm lg:text-base preserve-ws">${this.escapeHTML(p.statement)}</div>
                        </div>
                        <div class="bg-gray-800 rounded-xl border border-gray-700 p-4" id="practice-actions"></div>
                    </div>
                    <div class="w-full lg:w-1/2 bg-[#0d1117] rounded-xl border border-gray-700 flex flex-col overflow-hidden shadow-2xl">
                        <!-- IDE Top Window Bar -->
                        <div class="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-gray-800">
                            <div class="flex items-center space-x-3">
                                <div class="flex space-x-1.5">
                                    <span class="w-3 h-3 rounded-full bg-red-500/80 inline-block"></span>
                                    <span class="w-3 h-3 rounded-full bg-yellow-500/80 inline-block"></span>
                                    <span class="w-3 h-3 rounded-full bg-green-500/80 inline-block"></span>
                                </div>
                                <span class="text-xs font-mono text-gray-400 flex items-center space-x-1.5">
                                    <i class="fa-solid fa-file-code text-blue-400"></i>
                                    <span>${fileNames[lang]}</span>
                                </span>
                            </div>
                            <div class="flex items-center space-x-2">
                                <select onchange="app.changeIdeLanguage(this.value)" class="bg-[#0d1117] text-gray-300 text-xs font-mono rounded px-2.5 py-1 border border-gray-700 outline-none focus:border-primary">
                                    <option value="java" ${lang === 'java' ? 'selected' : ''}>Java</option>
                                    <option value="python" ${lang === 'python' ? 'selected' : ''}>Python 3</option>
                                    <option value="cpp" ${lang === 'cpp' ? 'selected' : ''}>C++</option>
                                    <option value="javascript" ${lang === 'javascript' ? 'selected' : ''}>JavaScript</option>
                                </select>
                                <button onclick="app.resetScratchpadCode()" title="Reset Starter Code" aria-label="Reset scratchpad to the starter template" class="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-xs transition-colors">
                                    <i class="fa-solid fa-rotate-left"></i>
                                </button>
                            </div>
                        </div>

                        <!-- IDE Tabs -->
                        <div class="flex border-b border-gray-800 bg-[#161b22]">
                            <button onclick="app.toggleCodeTab('scratchpad')" class="px-5 py-2.5 text-xs font-mono font-medium text-white border-t-2 border-primary bg-[#0d1117] w-1/2 text-center flex items-center justify-center space-x-2" id="tab-scratchpad">
                                <i class="fa-solid fa-terminal text-primary"></i><span>Editor (${fileNames[lang]})</span>
                            </button>
                            <button onclick="app.toggleCodeTab('solution')" class="px-5 py-2.5 text-xs font-mono font-medium text-gray-500 hover:text-gray-300 w-1/2 text-center flex items-center justify-center space-x-2" id="tab-solution">
                                <i class="fa-solid fa-lock text-gray-600" id="sol-lock-icon"></i><span>Optimal Solution</span>
                            </button>
                        </div>

                        <!-- IDE Code Area -->
                        <div class="flex-grow relative min-h-[320px] lg:min-h-[420px] flex overflow-hidden">
                            <div id="ide-editor-container" class="absolute inset-0 w-full h-full flex bg-[#0d1117]">
                                <div id="ide-line-numbers" aria-hidden="true" class="w-12 bg-[#0d1117] text-gray-600 font-mono text-sm py-4 pr-3 text-right select-none overflow-hidden border-r border-gray-800/80 leading-6"></div>
                                <textarea id="scratchpad-input"
                                    aria-label="Code scratchpad. Draft saves automatically for this problem and language."
                                    spellcheck="false"
                                    autocomplete="off"
                                    autocorrect="off"
                                    autocapitalize="off"
                                    onkeydown="app.handleIdeKeydown(event)"
                                    onscroll="app.syncIdeScroll()"
                                    onclick="app.updateIdeCursorPos()"
                                    onkeyup="app.updateIdeCursorPos()"
                                    oninput="app.saveDraft(this.value); app.updateIdeLineNumbers(); app.updateIdeCursorPos();"
                                    placeholder="// Scratchpad only — code is not executed in this trainer."
                                    class="flex-grow h-full bg-[#0d1117] text-gray-100 font-mono text-sm p-4 leading-6 resize-none outline-none selection:bg-blue-500/30">${this.escapeHTML(this.state.practiceState.scratchpad)}</textarea>
                            </div>
                            <div id="solution-panel" class="absolute inset-0 w-full h-full bg-[#0d1117] p-5 overflow-y-auto hidden z-10 flex flex-col">
                                <div class="flex-none flex items-center justify-between mb-4 pb-3 border-b border-gray-800">
                                    <h3 class="text-white font-bold text-sm flex items-center"><i class="fa-solid fa-circle-check text-green-500 mr-2"></i>Saved Optimal Solution</h3>
                                    <div class="flex space-x-2 text-xs font-mono">
                                        <span class="bg-blue-950/60 border border-blue-800/50 px-2.5 py-1 rounded text-blue-300">Time: ${this.escapeHTML(p.timeComplexity)}</span>
                                        <span class="bg-purple-950/60 border border-purple-800/50 px-2.5 py-1 rounded text-purple-300">Space: ${this.escapeHTML(p.spaceComplexity)}</span>
                                    </div>
                                </div>
                                <pre class="bg-[#161b22] p-4 rounded-lg border border-gray-800 overflow-x-auto"><code class="text-emerald-400 text-sm font-mono preserve-ws w-full block leading-6">${this.escapeHTML(p.solutionCode)}</code></pre>
                            </div>
                        </div>

                        <!-- IDE Bottom Status Bar -->
                        <div class="bg-[#161b22] border-t border-gray-800 px-4 py-1.5 flex justify-between items-center text-[11px] font-mono text-gray-400">
                            <div class="flex items-center space-x-3">
                                <span class="text-emerald-400 flex items-center"><i class="fa-solid fa-circle text-[7px] mr-1.5"></i>DRAFT SAVES AUTOMATICALLY</span>
                                <span>UTF-8</span>
                                <span>Spaces: 4</span>
                            </div>
                            <div id="ide-cursor-status">Ln 1, Col 1  |  0 chars</div>
                        </div>
                    </div>
                `;
                this.updateIdeLineNumbers();
                this.updateIdeCursorPos();
                this.renderPracticeActionArea();
            },

            toggleCodeTab(tab) {
                const editorContainer = document.getElementById('ide-editor-container');
                const sol = document.getElementById('solution-panel');
                const tabScratch = document.getElementById('tab-scratchpad');
                const tabSol = document.getElementById('tab-solution');
                const lockIcon = document.getElementById('sol-lock-icon');

                if (tab === 'scratchpad') {
                    editorContainer.classList.remove('hidden');
                    sol.classList.add('hidden');
                    tabScratch.className = "px-5 py-2.5 text-xs font-mono font-medium text-white border-t-2 border-primary bg-[#0d1117] w-1/2 text-center flex items-center justify-center space-x-2";
                    tabSol.className = "px-5 py-2.5 text-xs font-mono font-medium text-gray-500 hover:text-gray-300 w-1/2 text-center flex items-center justify-center space-x-2";
                } else {
                    if (this.state.practiceState.step < 2) {
                        this.showToast('Click "Reveal Solution" first to unlock!', 'info');
                        return;
                    }
                    if (lockIcon) {
                        lockIcon.className = "fa-solid fa-lock-open text-emerald-400";
                    }
                    editorContainer.classList.add('hidden');
                    sol.classList.remove('hidden');
                    tabSol.className = "px-5 py-2.5 text-xs font-mono font-medium text-white border-t-2 border-emerald-500 bg-[#0d1117] w-1/2 text-center flex items-center justify-center space-x-2";
                    tabScratch.className = "px-5 py-2.5 text-xs font-mono font-medium text-gray-500 hover:text-gray-300 w-1/2 text-center flex items-center justify-center space-x-2";
                }
            },

            advancePracticeStep(step) {
                this.state.practiceState.step = step;
                this.renderPracticeActionArea();
            },

            renderPracticeActionArea() {
                const container = document.getElementById('practice-actions');
                const step = this.state.practiceState.step;
                const p = this.state.practiceState.activeProblem;
                const solutionTab = document.getElementById('tab-solution');
                if (solutionTab) {
                    solutionTab.disabled = step < 2;
                    solutionTab.setAttribute('aria-disabled', String(step < 2));
                    solutionTab.classList.toggle('opacity-50', step < 2);
                    solutionTab.classList.toggle('cursor-not-allowed', step < 2);
                }

                if (step === 0) {
                    container.innerHTML = `<button onclick="app.advancePracticeStep(1)" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg"><i class="fa-solid fa-lightbulb mr-2"></i> Show Pattern Hint</button>`;
                } else if (step === 1) {
                    container.innerHTML = `
                        <div class="bg-blue-900/30 border border-blue-800 rounded-lg p-4 mb-4"><p class="text-sm text-blue-200"><i class="fa-solid fa-key mr-2"></i>${this.escapeHTML(p.hint)}</p></div>
                        <button onclick="app.advancePracticeStep(2)" class="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg"><i class="fa-solid fa-eye mr-2"></i> Reveal Solution & Complexity</button>
                    `;
                } else if (step === 2) {
                    container.innerHTML = `
                        <div class="bg-blue-900/30 border border-blue-800 rounded-lg p-3 mb-3"><p class="text-sm text-blue-200"><i class="fa-solid fa-key mr-2"></i>${this.escapeHTML(p.hint)}</p></div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                            <label class="text-xs text-gray-300">How did this attempt go?
                                <select id="attempt-outcome" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                                    <option value="independent">Solved independently before help</option>
                                    <option value="hint">Solved after using a hint</option>
                                    <option value="solution">Needed the solution / did not finish</option>
                                </select>
                            </label>
                            <label class="text-xs text-gray-300">Reflection: clue, key idea, or what to fix
                                <textarea id="attempt-reflection" rows="2" placeholder="What clue pointed to the pattern? What will you remember next time?" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"></textarea>
                            </label>
                        </div>
                        <div class="mb-2 flex justify-between items-center text-xs font-medium text-gray-400">
                            <span>Record attempt and schedule next review:</span>
                            <button onclick="app.rateProblem('practice_again')" class="text-blue-400 hover:text-blue-300 underline"><i class="fa-solid fa-rotate-left mr-1"></i>Practice This Again Now</button>
                        </div>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <button onclick="app.rateProblem('again')" title="Review again today" class="bg-gray-700 hover:bg-red-600 text-white py-2 rounded-lg text-xs sm:text-sm font-bold">Again</button>
                            <button onclick="app.rateProblem('hard')" title="Schedule a short interval" class="bg-gray-700 hover:bg-orange-600 text-white py-2 rounded-lg text-xs sm:text-sm font-bold">Hard</button>
                            <button onclick="app.rateProblem('good')" title="Schedule the standard adaptive interval" class="bg-gray-700 hover:bg-green-600 text-white py-2 rounded-lg text-xs sm:text-sm font-bold">Good</button>
                            <button onclick="app.rateProblem('easy')" title="Schedule a longer adaptive interval" class="bg-gray-700 hover:bg-blue-600 text-white py-2 rounded-lg text-xs sm:text-sm font-bold">Easy</button>
                        </div>
                    `;
                    this.toggleCodeTab('solution');
                }
            }
        };

        window.addEventListener('pagehide', () => {
            if (app.draftSaveTimeout) clearTimeout(app.draftSaveTimeout);
            app.saveData();
        });
        document.addEventListener('DOMContentLoaded', () => app.init());

export function appendSources(messageElement, sources) {
    if (!sources?.length) return;

    const sourcesContainer = document.createElement('div');
    sourcesContainer.className = 'sources-container';
    sourcesContainer.innerHTML = '<h4>Sources</h4>';

    const sourcesList = document.createElement('ul');
    sourcesList.className = 'sources-list';

    sources.forEach(source => {
        const sourceItem = document.createElement('li');
        sourceItem.className = 'source-item';
        sourceItem.textContent = source.metadata?.filename || 'Unknown source';
        sourcesList.appendChild(sourceItem);
    });

    sourcesContainer.appendChild(sourcesList);
    messageElement.appendChild(sourcesContainer);
}

export function appendFollowUpQuestions(messageElement, questions, messageInput) {
    if (!questions?.length) return;

    const questionsContainer = document.createElement('div');
    questionsContainer.className = 'follow-up-container';

    questions.forEach(question => {
        const questionText = typeof question === 'string' ? question : question.text;

        const questionButton = document.createElement('button');
        questionButton.className = 'follow-up-button';
        questionButton.textContent = questionText;

        questionButton.addEventListener('click', () => {
            messageInput.value = questionText;
            messageInput.dispatchEvent(new Event('input'));
            messageInput.focus();
        });

        questionsContainer.appendChild(questionButton);
    });

    messageElement.appendChild(questionsContainer);
}

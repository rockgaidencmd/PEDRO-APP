let quizData = [];
let currentQuestion = 0;
let userAnswers = [];
let answered = false;

// Cargar datos del JSON
async function loadQuestions() {
    try {
        const response = await fetch('questions.json');
        const data = await response.json();
        quizData = data.preguntas;
        document.getElementById('totalQuestions').textContent = quizData.length;
        displayQuestion();
    } catch (error) {
        console.error('Error al cargar las preguntas:', error);
        document.body.innerHTML = '<h1 style="text-align:center; color:red;">Error al cargar las preguntas</h1>';
    }
}

function displayQuestion() {
    const question = quizData[currentQuestion];
    const isAnswered = userAnswers[currentQuestion] !== undefined;

    // Mostrar número de pregunta
    document.getElementById('currentQuestion').textContent = currentQuestion + 1;

    // Mostrar pregunta
    document.getElementById('questionText').textContent = question.enunciado;

    // Mostrar opciones
    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = '';

    question.opciones.forEach((opcion, index) => {
        const button = document.createElement('button');
        button.className = 'option';
        button.textContent = opcion;
        button.onclick = () => selectOption(index);

        // Si ya fue respondida, mostrar estado
        if (isAnswered) {
            button.disabled = true;
            button.classList.add('disabled');
            
            if (index === question.respuestaCorrecta - 1) {
                button.classList.add('correct');
            } else if (index === userAnswers[currentQuestion]) {
                button.classList.add('incorrect');
            }
        }

        optionsContainer.appendChild(button);
    });

    // Mostrar retroalimentación si ya fue respondida
    const feedbackDiv = document.getElementById('feedback');
    if (isAnswered) {
        feedbackDiv.classList.add('show');
        const isCorrect = userAnswers[currentQuestion] === question.respuestaCorrecta - 1;
        feedbackDiv.className = 'feedback show ' + (isCorrect ? 'correct' : 'incorrect');
        
        const resultText = isCorrect ? '✓ Correcto' : '✗ Incorrecto';
        feedbackDiv.innerHTML = '<strong>' + resultText + '</strong><br><br>' + question.explicacion;
    } else {
        feedbackDiv.classList.remove('show');
    }

    // Actualizar estado de botones
    document.getElementById('prevBtn').disabled = currentQuestion === 0;
    
    // Si es la última pregunta y todas fueron respondidas
    const allAnswered = userAnswers.length === quizData.length;
    if (currentQuestion === quizData.length - 1 && isAnswered) {
        document.getElementById('nextBtn').textContent = 'Ver resultados';
    } else {
        document.getElementById('nextBtn').textContent = 'Siguiente →';
    }

    // Actualizar barra de progreso
    const progress = ((currentQuestion + 1) / quizData.length) * 100;
    document.getElementById('progressFill').style.width = progress + '%';
}

function selectOption(index) {
    const question = quizData[currentQuestion];
    
    if (userAnswers[currentQuestion] !== undefined) return;

    userAnswers[currentQuestion] = index;
    displayQuestion();
}

function nextQuestion() {
    if (currentQuestion < quizData.length - 1) {
        currentQuestion++;
        displayQuestion();
    } else if (userAnswers.length === quizData.length) {
        showResults();
    }
}

function previousQuestion() {
    if (currentQuestion > 0) {
        currentQuestion--;
        displayQuestion();
    }
}

function showResults() {
    const correct = userAnswers.filter((answer, index) => 
        answer === quizData[index].respuestaCorrecta - 1
    ).length;

    const percentage = Math.round((correct / quizData.length) * 100);

    document.querySelector('.quiz-container').style.display = 'none';
    document.getElementById('progressFill').parentElement.style.display = 'none';
    document.querySelector('.progress-text').style.display = 'none';
    
    const scoreContainer = document.getElementById('scoreContainer');
    scoreContainer.style.display = 'block';
    document.getElementById('finalScore').textContent = correct + ' de ' + quizData.length + ' preguntas correctas (' + percentage + '%)';
}

function restartQuiz() {
    currentQuestion = 0;
    userAnswers = [];
    
    document.querySelector('.quiz-container').style.display = 'block';
    document.getElementById('progressFill').parentElement.style.display = 'block';
    document.querySelector('.progress-text').style.display = 'block';
    document.getElementById('scoreContainer').style.display = 'none';
    
    displayQuestion();
}

// Cargar preguntas al abrir la página
window.addEventListener('DOMContentLoaded', loadQuestions);

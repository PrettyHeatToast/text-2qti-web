// Example quizzes
const EXAMPLES = {
  math: `Quiz title: Addition
Quiz description: Checking addition.

Title: An addition question
Points: 2
1. What is 2+3?
   ... General question feedback.
   + Feedback for correct answer.
   - Feedback for incorrect answer.
   a) 6
   ... Feedback for this particular answer.
   b) 1
   ... Feedback for this particular answer.
   *c) 5
   ... Feedback for this particular answer.`,
  
  biology: `Quiz title: Biology Basics
Quiz description: Test your biology knowledge.

1. All plants are green.
   *a) true
   b) false

2. Mitochondria is the powerhouse of the cell.
   *a) true
   b) false

3. DNA is found in prokaryotes.
   a) true
   *b) false`,
  
  multiple: `Quiz title: Dinosaurs
Quiz description: Which of these are dinosaurs?

1. Which of the following are dinosaurs?
   [*] Tyrannosaurus rex
   [*] Triceratops
   [ ] Woolly mammoth
   [ ] Smilodon fatalis`,
  
  mixed: `Quiz title: Comprehensive Quiz
Quiz description: Testing various question types.

1. What is the square root of 2?
   = 1.4142 +- 0.0001

2. Who lives at the North Pole?
   * Santa
   * Santa Claus
   * Father Christmas

3. Write an essay about climate change.
   ... Consider discussing the greenhouse effect, carbon emissions, and human impact.
   ____`
};

// Parser class
class Text2QTIParser {
  constructor(text) {
    this.text = text;
    this.lines = text.split('\n');
    this.currentLine = 0;
    this.quiz = {
      title: 'Untitled Quiz',
      description: '',
      options: [],
      questions: []
    };
    this.errors = [];
  }

  parse() {
    try {
      while (this.currentLine < this.lines.length) {
        const line = this.lines[this.currentLine].trim();
        
        if (line.startsWith('Quiz title:')) {
          this.quiz.title = line.substring('Quiz title:'.length).trim();
        } else if (line.startsWith('Quiz description:')) {
          this.quiz.description = line.substring('Quiz description:'.length).trim();
        } else if (this.isQuizOption(line)) {
          this.quiz.options.push(line.trim());
        } else if (this.isQuestionStart(line)) {
          const question = this.parseQuestion();
          if (question) {
            this.quiz.questions.push(question);
          }
          continue; // parseQuestion advances currentLine
        }
        
        this.currentLine++;
      }
      
      return { quiz: this.quiz, errors: this.errors };
    } catch (error) {
      this.errors.push(`Parsing error: ${error.message}`);
      return { quiz: this.quiz, errors: this.errors };
    }
  }

  isQuizOption(line) {
    const options = [
      'shuffle answers',
      'show correct answers',
      'one question at a time',
      "can't go back",
      'cant go back'
    ];
    return options.some(opt => line.toLowerCase().includes(opt));
  }

  isQuestionStart(line) {
    return /^\d+\.\s/.test(line);
  }

  parseQuestion() {
    const question = {
      number: null,
      title: '',
      text: '',
      points: 1,
      type: 'multiple_choice',
      answers: [],
      feedback: {
        general: '',
        correct: '',
        incorrect: '',
        perAnswer: {}
      }
    };

    // Look back for Title and Points
    let lookbackLine = this.currentLine - 1;
    while (lookbackLine >= 0 && this.lines[lookbackLine].trim() !== '') {
      const line = this.lines[lookbackLine].trim();
      if (line.startsWith('Title:')) {
        question.title = line.substring('Title:'.length).trim();
      } else if (line.startsWith('Points:')) {
        question.points = parseInt(line.substring('Points:'.length).trim()) || 1;
      }
      lookbackLine--;
    }

    // Parse question number and text
    const questionLine = this.lines[this.currentLine].trim();
    const match = questionLine.match(/^(\d+)\.\s+(.*)/);
    if (match) {
      question.number = parseInt(match[1]);
      question.text = match[2];
    }

    this.currentLine++;

    // Parse answers and feedback
    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine];
      const trimmed = line.trim();

      // Stop at next question or empty line followed by question
      if (this.isQuestionStart(trimmed)) {
        break;
      }

      // Check for feedback
      if (trimmed.startsWith('...')) {
        const feedback = trimmed.substring(3).trim();
        if (question.answers.length === 0) {
          question.feedback.general = feedback;
        } else {
          // Feedback for last answer
          const lastAnswer = question.answers[question.answers.length - 1];
          if (lastAnswer) {
            question.feedback.perAnswer[lastAnswer.id] = feedback;
          }
        }
      } else if (trimmed.startsWith('+')) {
        question.feedback.correct = trimmed.substring(1).trim();
      } else if (trimmed.startsWith('-')) {
        question.feedback.incorrect = trimmed.substring(1).trim();
      }
      // Multiple choice answers
      else if (/^\*?[a-z]\)\s/.test(trimmed)) {
        const isCorrect = trimmed.startsWith('*');
        const text = trimmed.replace(/^\*?[a-z]\)\s*/, '');
        const letter = trimmed.match(/[a-z]\)/)[0][0];
        question.answers.push({
          id: letter,
          text: text,
          correct: isCorrect
        });
        question.type = 'multiple_choice';
      }
      // Multiple answers (checkboxes)
      else if (/^\[\*?\]\s/.test(trimmed)) {
        const isCorrect = trimmed.includes('[*]');
        const text = trimmed.replace(/^\[\*?\]\s*/, '');
        question.answers.push({
          id: `ans_${question.answers.length}`,
          text: text,
          correct: isCorrect
        });
        question.type = 'multiple_answers';
      }
      // Numerical answer
      else if (trimmed.startsWith('=')) {
        const numText = trimmed.substring(1).trim();
        question.type = 'numerical';
        question.answers.push(this.parseNumerical(numText));
      }
      // Short answer
      else if (trimmed.startsWith('*') && !trimmed.match(/^\*[a-z]\)/)) {
        const text = trimmed.substring(1).trim();
        question.type = 'short_answer';
        question.answers.push({
          text: text,
          correct: true
        });
      }
      // Essay question
      else if (trimmed.match(/^_{4,}$/)) {
        question.type = 'essay';
      }
      // File upload
      else if (trimmed.match(/^\^{4,}$/)) {
        question.type = 'file_upload';
      }
      // Continue multi-line question text
      else if (trimmed !== '' && question.answers.length === 0 && !trimmed.startsWith('Title:') && !trimmed.startsWith('Points:')) {
        question.text += ' ' + trimmed;
      }

      this.currentLine++;

      // Stop if we hit an empty line and the next non-empty is a question
      if (trimmed === '') {
        let nextNonEmpty = this.currentLine;
        while (nextNonEmpty < this.lines.length && this.lines[nextNonEmpty].trim() === '') {
          nextNonEmpty++;
        }
        if (nextNonEmpty < this.lines.length && this.isQuestionStart(this.lines[nextNonEmpty].trim())) {
          break;
        }
      }
    }

    return question;
  }

  parseNumerical(text) {
    // Format: value +- margin or [min, max] or just value
    if (text.includes('+-')) {
      const parts = text.split('+-').map(p => p.trim());
      const value = parseFloat(parts[0]);
      const margin = parseFloat(parts[1]);
      return {
        type: 'range',
        value: value,
        min: value - margin,
        max: value + margin,
        correct: true
      };
    } else if (text.includes('[') && text.includes(']')) {
      const match = text.match(/\[([^,]+),([^\]]+)\]/);
      if (match) {
        return {
          type: 'range',
          min: parseFloat(match[1].trim()),
          max: parseFloat(match[2].trim()),
          correct: true
        };
      }
    }
    return {
      type: 'exact',
      value: parseFloat(text),
      correct: true
    };
  }
}

// QTI Generator class
class QTIGenerator {
  constructor(quiz) {
    this.quiz = quiz;
    this.assessmentId = 'quiz_' + Date.now();
  }

  generateManifest() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="man_${this.assessmentId}" 
          xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
          xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_v1p2"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd
                              http://www.imsglobal.org/xsd/imsmd_v1p2 imsmd_v1p2p2.xsd">
  <metadata>
    <schema>IMS Content</schema>
    <schemaversion>1.1</schemaversion>
  </metadata>
  <organizations/>
  <resources>
    <resource identifier="res_${this.assessmentId}" type="imsqti_xmlv1p2" href="${this.assessmentId}.xml">
      <file href="${this.assessmentId}.xml"/>
    </resource>
  </resources>
</manifest>`;
  }

  generateAssessment() {
    const xml = [];
    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push('<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd">');
    xml.push(`  <assessment ident="${this.assessmentId}" title="${this.escapeXml(this.quiz.title)}">`);    
    
    // Assessment metadata
    xml.push('    <qtimetadata>');
    xml.push('      <qtimetadatafield>');
    xml.push('        <fieldlabel>cc_maxattempts</fieldlabel>');
    xml.push('        <fieldentry>1</fieldentry>');
    xml.push('      </qtimetadatafield>');
    xml.push('    </qtimetadata>');
    
    // Section containing all questions
    xml.push('    <section ident="root_section">');
    
    this.quiz.questions.forEach((question, index) => {
      xml.push(this.generateItem(question, index));
    });
    
    xml.push('    </section>');
    xml.push('  </assessment>');
    xml.push('</questestinterop>');
    
    return xml.join('\n');
  }

  generateItem(question, index) {
    const itemId = `question_${index + 1}`;
    const xml = [];
    
    xml.push(`      <item ident="${itemId}" title="Question ${question.number || index + 1}">`);
    
    // Item metadata
    xml.push('        <itemmetadata>');
    xml.push('          <qtimetadata>');
    xml.push('            <qtimetadatafield>');
    xml.push('              <fieldlabel>question_type</fieldlabel>');
    xml.push(`              <fieldentry>${this.getCanvasQuestionType(question.type)}</fieldentry>`);
    xml.push('            </qtimetadatafield>');
    xml.push('            <qtimetadatafield>');
    xml.push('              <fieldlabel>points_possible</fieldlabel>');
    xml.push(`              <fieldentry>${question.points}</fieldentry>`);
    xml.push('            </qtimetadatafield>');
    xml.push('          </qtimetadata>');
    xml.push('        </itemmetadata>');
    
    // Presentation
    xml.push('        <presentation>');
    xml.push('          <material>');
    xml.push('            <mattext texttype="text/html">');
    let questionText = this.escapeXml(question.text);
    if (question.title) {
      questionText = `<strong>${this.escapeXml(question.title)}</strong><br/>${questionText}`;
    }
    xml.push(`              ${questionText}`);
    xml.push('            </mattext>');
    xml.push('          </material>');
    
    if (question.type === 'multiple_choice' || question.type === 'multiple_answers') {
      xml.push(`          <response_lid ident="response1" rcardinality="${question.type === 'multiple_answers' ? 'Multiple' : 'Single'}">`);
      xml.push('            <render_choice>');
      question.answers.forEach((answer, aIndex) => {
        const answerId = answer.id || `ans_${aIndex}`;
        xml.push(`              <response_label ident="${answerId}">`);
        xml.push('                <material>');
        xml.push('                  <mattext texttype="text/plain">');
        xml.push(`                    ${this.escapeXml(answer.text)}`);
        xml.push('                  </mattext>');
        xml.push('                </material>');
        xml.push('              </response_label>');
      });
      xml.push('            </render_choice>');
      xml.push('          </response_lid>');
    } else if (question.type === 'numerical') {
      xml.push('          <response_str ident="response1" rcardinality="Single">');
      xml.push('            <render_fib>');
      xml.push('              <response_label ident="answer1"/>');
      xml.push('            </render_fib>');
      xml.push('          </response_str>');
    } else if (question.type === 'short_answer') {
      xml.push('          <response_str ident="response1" rcardinality="Single">');
      xml.push('            <render_fib>');
      xml.push('              <response_label ident="answer1"/>');
      xml.push('            </render_fib>');
      xml.push('          </response_str>');
    } else if (question.type === 'essay') {
      xml.push('          <response_str ident="response1" rcardinality="Single">');
      xml.push('            <render_fib>');
      xml.push('              <response_label ident="answer1"/>');
      xml.push('            </render_fib>');
      xml.push('          </response_str>');
    } else if (question.type === 'file_upload') {
      xml.push('          <response_str ident="response1" rcardinality="Single">');
      xml.push('            <render_fib>');
      xml.push('              <response_label ident="answer1"/>');
      xml.push('            </render_fib>');
      xml.push('          </response_str>');
    }
    
    xml.push('        </presentation>');
    
    // Response processing
    xml.push('        <resprocessing>');
    xml.push('          <outcomes>');
    xml.push('            <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>');
    xml.push('          </outcomes>');
    
    if (question.type === 'multiple_choice' || question.type === 'multiple_answers') {
      question.answers.forEach((answer) => {
        if (answer.correct) {
          xml.push('          <respcondition continue="No">');
          xml.push('            <conditionvar>');
          xml.push(`              <varequal respident="response1">${answer.id}</varequal>`);
          xml.push('            </conditionvar>');
          xml.push(`            <setvar action="Set" varname="SCORE">${question.points}</setvar>`);
          xml.push('          </respcondition>');
        }
      });
    } else if (question.type === 'numerical') {
      question.answers.forEach((answer) => {
        if (answer.type === 'range') {
          xml.push('          <respcondition continue="No">');
          xml.push('            <conditionvar>');
          xml.push('              <and>');
          xml.push(`                <vargte respident="response1">${answer.min}</vargte>`);
          xml.push(`                <varlte respident="response1">${answer.max}</varlte>`);
          xml.push('              </and>');
          xml.push('            </conditionvar>');
          xml.push(`            <setvar action="Set" varname="SCORE">${question.points}</setvar>`);
          xml.push('          </respcondition>');
        } else {
          xml.push('          <respcondition continue="No">');
          xml.push('            <conditionvar>');
          xml.push(`              <varequal respident="response1">${answer.value}</varequal>`);
          xml.push('            </conditionvar>');
          xml.push(`            <setvar action="Set" varname="SCORE">${question.points}</setvar>`);
          xml.push('          </respcondition>');
        }
      });
    } else if (question.type === 'short_answer') {
      question.answers.forEach((answer) => {
        xml.push('          <respcondition continue="No">');
        xml.push('            <conditionvar>');
        xml.push(`              <varequal respident="response1">${this.escapeXml(answer.text)}</varequal>`);
        xml.push('            </conditionvar>');
        xml.push(`            <setvar action="Set" varname="SCORE">${question.points}</setvar>`);
        xml.push('          </respcondition>');
      });
    }
    
    xml.push('        </resprocessing>');
    
    // Feedback
    if (question.feedback.general || question.feedback.correct || question.feedback.incorrect) {
      if (question.feedback.general) {
        xml.push('        <itemfeedback ident="general_fb">');
        xml.push('          <flow_mat>');
        xml.push('            <material>');
        xml.push('              <mattext texttype="text/html">');
        xml.push(`                ${this.escapeXml(question.feedback.general)}`);
        xml.push('              </mattext>');
        xml.push('            </material>');
        xml.push('          </flow_mat>');
        xml.push('        </itemfeedback>');
      }
      if (question.feedback.correct) {
        xml.push('        <itemfeedback ident="correct_fb">');
        xml.push('          <flow_mat>');
        xml.push('            <material>');
        xml.push('              <mattext texttype="text/html">');
        xml.push(`                ${this.escapeXml(question.feedback.correct)}`);
        xml.push('              </mattext>');
        xml.push('            </material>');
        xml.push('          </flow_mat>');
        xml.push('        </itemfeedback>');
      }
      if (question.feedback.incorrect) {
        xml.push('        <itemfeedback ident="incorrect_fb">');
        xml.push('          <flow_mat>');
        xml.push('            <material>');
        xml.push('              <mattext texttype="text/html">');
        xml.push(`                ${this.escapeXml(question.feedback.incorrect)}`);
        xml.push('              </mattext>');
        xml.push('            </material>');
        xml.push('          </flow_mat>');
        xml.push('        </itemfeedback>');
      }
    }
    
    xml.push('      </item>');
    
    return xml.join('\n');
  }

  getCanvasQuestionType(type) {
    const typeMap = {
      'multiple_choice': 'multiple_choice_question',
      'multiple_answers': 'multiple_answers_question',
      'true_false': 'true_false_question',
      'numerical': 'numerical_question',
      'short_answer': 'short_answer_question',
      'essay': 'essay_question',
      'file_upload': 'file_upload_question'
    };
    return typeMap[type] || 'multiple_choice_question';
  }

  escapeXml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  async generateZip() {
    const zip = new JSZip();
    
    // Add manifest
    zip.file('imsmanifest.xml', this.generateManifest());
    
    // Add assessment XML
    zip.file(`${this.assessmentId}.xml`, this.generateAssessment());
    
    // Generate the zip file
    return await zip.generateAsync({ type: 'blob' });
  }
}

// UI Controller
class UIController {
  constructor() {
    this.editor = document.getElementById('quizEditor');
    this.preview = document.getElementById('quizPreview');
    this.downloadBtn = document.getElementById('downloadBtn');
    this.clearBtn = document.getElementById('clearBtn');
    this.loadExampleBtn = document.getElementById('loadExampleBtn');
    this.exampleSelect = document.getElementById('exampleSelect');
    this.errorContainer = document.getElementById('errorContainer');
    this.statusContainer = document.getElementById('statusContainer');
    
    this.currentQuiz = null;
    this.currentErrors = [];
    
    this.init();
  }

  init() {
    // Event listeners
    this.editor.addEventListener('input', () => this.handleEditorChange());
    this.downloadBtn.addEventListener('click', () => this.handleDownload());
    this.clearBtn.addEventListener('click', () => this.handleClear());
    this.loadExampleBtn.addEventListener('click', () => this.handleLoadExample());
    
    // Initial parse
    this.handleEditorChange();
  }

  handleEditorChange() {
    const text = this.editor.value;
    
    if (!text.trim()) {
      this.preview.innerHTML = '<div class="empty-state">Start typing to see preview...</div>';
      this.currentQuiz = null;
      this.currentErrors = [];
      this.hideError();
      this.hideStatus();
      return;
    }
    
    const parser = new Text2QTIParser(text);
    const result = parser.parse();
    
    this.currentQuiz = result.quiz;
    this.currentErrors = result.errors;
    
    if (result.errors.length > 0) {
      this.showError(result.errors.join('<br>'));
    } else {
      this.hideError();
    }
    
    this.renderPreview(result.quiz);
    this.updateStatus();
  }

  renderPreview(quiz) {
    const html = [];
    
    // Quiz title and description
    if (quiz.title) {
      html.push(`<div class="quiz-title">${this.escapeHtml(quiz.title)}</div>`);
    }
    
    if (quiz.description) {
      html.push(`<div class="quiz-description">${this.escapeHtml(quiz.description)}</div>`);
    }
    
    // Quiz options
    if (quiz.options.length > 0) {
      html.push('<div class="quiz-options">');
      html.push('<div class="quiz-options-title">Quiz Options:</div>');
      html.push('<ul>');
      quiz.options.forEach(opt => {
        html.push(`<li>${this.escapeHtml(opt)}</li>`);
      });
      html.push('</ul>');
      html.push('</div>');
    }
    
    // Questions
    quiz.questions.forEach((question, index) => {
      html.push(this.renderQuestion(question, index));
    });
    
    this.preview.innerHTML = html.join('');
  }

  renderQuestion(question, index) {
    const html = [];
    
    html.push('<div class="question">');
    html.push('  <div class="question-header">');
    html.push(`    <div class="question-number">Question ${question.number || index + 1}</div>`);
    html.push('    <div class="question-meta">');
    html.push(`      <span class="question-type">${this.getQuestionTypeLabel(question.type)}</span>`);
    html.push(`      <span class="question-points">${question.points} ${question.points === 1 ? 'pt' : 'pts'}</span>`);
    html.push('    </div>');
    html.push('  </div>');
    
    if (question.title) {
      html.push(`  <div class="question-title">${this.escapeHtml(question.title)}</div>`);
    }
    
    html.push(`  <div class="question-text">${this.escapeHtml(question.text)}</div>`);
    
    // Render answers based on type
    if (question.type === 'multiple_choice' || question.type === 'multiple_answers') {
      html.push('  <div class="answers">');
      question.answers.forEach(answer => {
        const correctClass = answer.correct ? 'correct' : 'incorrect';
        const prefix = answer.correct ? (question.type === 'multiple_answers' ? '[✓]' : '*') : '';
        html.push(`    <div class="answer ${correctClass}">`);
        html.push(`      <span class="answer-prefix">${answer.id})${prefix}</span>`);
        html.push(`      ${this.escapeHtml(answer.text)}`);
        html.push('    </div>');
      });
      html.push('  </div>');
    } else if (question.type === 'numerical') {
      html.push('  <div class="answers">');
      question.answers.forEach(answer => {
        if (answer.type === 'range') {
          html.push(`    <div class="answer correct">`);
          html.push(`      <strong>Acceptable Range:</strong> ${answer.min} to ${answer.max}`);
          html.push('    </div>');
        } else {
          html.push(`    <div class="answer correct">`);
          html.push(`      <strong>Correct Answer:</strong> ${answer.value}`);
          html.push('    </div>');
        }
      });
      html.push('  </div>');
    } else if (question.type === 'short_answer') {
      html.push('  <div class="answers">');
      html.push('    <div class="answer correct">');
      html.push('      <strong>Acceptable Answers:</strong>');
      html.push('      <ul>');
      question.answers.forEach(answer => {
        html.push(`        <li>${this.escapeHtml(answer.text)}</li>`);
      });
      html.push('      </ul>');
      html.push('    </div>');
      html.push('  </div>');
    } else if (question.type === 'essay') {
      html.push('  <div class="essay-indicator">');
      html.push('    Student will provide essay response');
      html.push('  </div>');
    } else if (question.type === 'file_upload') {
      html.push('  <div class="essay-indicator">');
      html.push('    Student will upload file');
      html.push('  </div>');
    }
    
    // Render feedback
    const hasFeedback = question.feedback.general || question.feedback.correct || question.feedback.incorrect || Object.keys(question.feedback.perAnswer).length > 0;
    if (hasFeedback) {
      html.push('  <div class="feedback">');
      html.push('    <div class="feedback-title">Feedback:</div>');
      if (question.feedback.general) {
        html.push(`    <div class="feedback-item"><strong>General:</strong> ${this.escapeHtml(question.feedback.general)}</div>`);
      }
      if (question.feedback.correct) {
        html.push(`    <div class="feedback-item"><strong>Correct:</strong> ${this.escapeHtml(question.feedback.correct)}</div>`);
      }
      if (question.feedback.incorrect) {
        html.push(`    <div class="feedback-item"><strong>Incorrect:</strong> ${this.escapeHtml(question.feedback.incorrect)}</div>`);
      }
      Object.keys(question.feedback.perAnswer).forEach(key => {
        html.push(`    <div class="feedback-item"><strong>For ${key}:</strong> ${this.escapeHtml(question.feedback.perAnswer[key])}</div>`);
      });
      html.push('  </div>');
    }
    
    html.push('</div>');
    
    return html.join('');
  }

  getQuestionTypeLabel(type) {
    const labels = {
      'multiple_choice': 'Multiple Choice',
      'multiple_answers': 'Multiple Answers',
      'true_false': 'True/False',
      'numerical': 'Numerical',
      'short_answer': 'Short Answer',
      'essay': 'Essay',
      'file_upload': 'File Upload'
    };
    return labels[type] || type;
  }

  async handleDownload() {
    if (!this.currentQuiz || this.currentQuiz.questions.length === 0) {
      this.showError('No valid quiz to download. Please enter quiz content first.');
      return;
    }
    
    try {
      this.showStatus('Generating QTI package...');
      this.downloadBtn.disabled = true;
      this.downloadBtn.textContent = 'Generating...';
      
      const generator = new QTIGenerator(this.currentQuiz);
      const blob = await generator.generateZip();
      
      // Trigger download
      saveAs(blob, `${this.sanitizeFilename(this.currentQuiz.title)}.zip`);
      
      this.showStatus('QTI package downloaded successfully!');
      this.downloadBtn.disabled = false;
      this.downloadBtn.textContent = 'Download QTI Zip';
      
      setTimeout(() => this.hideStatus(), 3000);
    } catch (error) {
      this.showError(`Error generating QTI: ${error.message}`);
      this.downloadBtn.disabled = false;
      this.downloadBtn.textContent = 'Download QTI Zip';
    }
  }

  handleClear() {
    if (confirm('Are you sure you want to clear the editor?')) {
      this.editor.value = '';
      this.handleEditorChange();
    }
  }

  handleLoadExample() {
    const selectedExample = this.exampleSelect.value;
    if (selectedExample && EXAMPLES[selectedExample]) {
      this.editor.value = EXAMPLES[selectedExample];
      this.handleEditorChange();
      this.exampleSelect.value = '';
    } else {
      this.showError('Please select an example from the dropdown first.');
      setTimeout(() => this.hideError(), 2000);
    }
  }

  showError(message) {
    this.errorContainer.innerHTML = message;
    this.errorContainer.style.display = 'block';
  }

  hideError() {
    this.errorContainer.style.display = 'none';
  }

  showStatus(message) {
    this.statusContainer.innerHTML = message;
    this.statusContainer.style.display = 'block';
  }

  hideStatus() {
    this.statusContainer.style.display = 'none';
  }

  updateStatus() {
    if (this.currentQuiz && this.currentQuiz.questions.length > 0) {
      this.showStatus(`✓ Valid quiz with ${this.currentQuiz.questions.length} question${this.currentQuiz.questions.length === 1 ? '' : 's'}`);
    } else {
      this.hideStatus();
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  sanitizeFilename(filename) {
    return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  }
}

// Initialize the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new UIController();
  });
} else {
  new UIController();
}
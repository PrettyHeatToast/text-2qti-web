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

// Prompt for digitizing an existing test with an AI tool
const AI_PROMPT = `Convert the test below into text2qti format. Reply with ONLY the converted text in one plain-text block, no explanations. Keep the original language and wording of the questions. Do not invent questions, answers or feedback. If the correct answer is not given in the source, still write the question and add the line "REVIEW: correct answer unknown" under it.

Format rules:
- Start with "Quiz title: <title>" and optionally "Quiz description: <text>".
- Number every question as "1. ", "2. ", ... and separate questions with a blank line.
- Optional lines directly above a question: "Title: <short title>" and "Points: <number>" (use a decimal point, e.g. 0.5).
- Multiple choice (one correct answer): lowercase letters a), b), c). Put * before the correct one: "*b) text".
- Multiple answers (several correct): "[*] correct option" and "[ ] wrong option".
- Short answer (accepted answers): "* accepted answer" (one line per accepted answer).
- Numerical answer: "= 4.5" or "= 4.5 +- 0.1" or "= [4.4, 4.6]".
- Open/essay question: a line with "____".
- File upload: a line with "^^^^".
- Feedback (optional): "... text" directly under the question text is general feedback, "... text" under an answer is feedback for that answer, "+ text" is feedback for correct, "- text" is feedback for incorrect.
- Plain text only: no Markdown, no bold, no tables, no images (write "[image missing]" instead).

Example:

Quiz title: Biology Basics
Quiz description: Chapter 1 test.

Points: 2
1. What is the powerhouse of the cell?
   a) Nucleus
   *b) Mitochondria
   c) Ribosome

Points: 1.5
2. Which of these are mammals?
   [*] Dolphin
   [*] Bat
   [ ] Shark

3. What is the chemical symbol for water?
   * H2O

4. Explain the difference between mitosis and meiosis.
   ____

The test to convert:
`;

// Parser class
class Text2QTIParser {
  constructor(text) {
    // Strip Markdown code fences that AI tools often wrap around their output
    this.lines = text.split('\n').filter(line => !/^\s*```/.test(line));
    this.currentLine = 0;
    this.quiz = {
      title: 'Untitled Quiz',
      description: '',
      options: [],
      settings: {
        shuffleAnswers: false,
        showCorrectAnswers: true,
        oneQuestionAtATime: false,
        cantGoBack: false
      },
      questions: []
    };
    this.errors = [];
    this.warnings = [];
  }

  parse() {
    try {
      while (this.currentLine < this.lines.length) {
        const line = this.lines[this.currentLine].trim();

        if (line.startsWith('Quiz title:')) {
          this.quiz.title = line.substring('Quiz title:'.length).trim() || this.quiz.title;
        } else if (line.startsWith('Quiz description:')) {
          this.quiz.description = line.substring('Quiz description:'.length).trim();
        } else if (this.parseQuizOption(line)) {
          this.quiz.options.push(line);
        } else if (this.isQuestionStart(line)) {
          const question = this.parseQuestion();
          if (question) {
            this.quiz.questions.push(question);
          }
          continue; // parseQuestion advances currentLine
        } else if (line !== '' && !/^(Title|Points):/.test(line)) {
          this.warnings.push(`Line ignored (not part of a question): "${this.shorten(line)}"`);
        }

        this.currentLine++;
      }

      this.quiz.questions.forEach((q, i) => this.validateQuestion(q, i));
      if (this.quiz.questions.length === 0 && this.lines.some(l => l.trim() !== '')) {
        this.warnings.push('No questions found. Questions must start with a number and a period, like "1. Question text".');
      }

      return { quiz: this.quiz, errors: this.errors, warnings: this.warnings };
    } catch (error) {
      this.errors.push(`Parsing error: ${error.message}`);
      return { quiz: this.quiz, errors: this.errors, warnings: this.warnings };
    }
  }

  // Recognizes "shuffle answers" etc. (optionally followed by ": true/false") and applies it
  parseQuizOption(line) {
    const match = line.match(/^(shuffle answers|show correct answers|one question at a time|can'?t go back)\s*(?::\s*(true|false))?$/i);
    if (!match) return false;
    const value = !match[2] || match[2].toLowerCase() === 'true';
    const key = match[1].toLowerCase().replace(/'/g, '');
    const map = {
      'shuffle answers': 'shuffleAnswers',
      'show correct answers': 'showCorrectAnswers',
      'one question at a time': 'oneQuestionAtATime',
      'cant go back': 'cantGoBack'
    };
    this.quiz.settings[map[key]] = value;
    return true;
  }

  isQuestionStart(line) {
    return /^\d+\.\s/.test(line);
  }

  parsePoints(text) {
    const value = parseFloat(text.replace(',', '.'));
    return value >= 0 ? value : NaN;
  }

  shorten(text) {
    return text.length > 60 ? text.substring(0, 57) + '...' : text;
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
        incorrect: ''
      }
    };

    // Look back for Title and Points
    let lookbackLine = this.currentLine - 1;
    while (lookbackLine >= 0 && this.lines[lookbackLine].trim() !== '') {
      const line = this.lines[lookbackLine].trim();
      if (line.startsWith('Title:')) {
        question.title = line.substring('Title:'.length).trim();
      } else if (line.startsWith('Points:')) {
        const points = this.parsePoints(line.substring('Points:'.length).trim());
        if (isNaN(points)) {
          this.warnings.push(`Invalid points value "${this.shorten(line)}", using 1 point.`);
        } else {
          question.points = points;
        }
      }
      lookbackLine--;
    }

    // Parse question number and text
    const match = this.lines[this.currentLine].trim().match(/^(\d+)\.\s+(.*)/);
    if (match) {
      question.number = parseInt(match[1]);
      question.text = match[2];
    }

    this.currentLine++;

    // Where a continuation line (no marker) should be appended
    let lastTarget = 'text';

    while (this.currentLine < this.lines.length) {
      const trimmed = this.lines[this.currentLine].trim();

      if (this.isQuestionStart(trimmed)) {
        break;
      }

      let m;
      if (trimmed.startsWith('...')) {
        const feedback = trimmed.substring(3).trim();
        if (question.answers.length === 0) {
          question.feedback.general = feedback;
          lastTarget = 'general';
        } else {
          question.answers[question.answers.length - 1].feedback = feedback;
          lastTarget = 'answerFeedback';
        }
      } else if (/^\+(\s|$)/.test(trimmed)) {
        question.feedback.correct = trimmed.substring(1).trim();
        lastTarget = 'correct';
      } else if (/^-(\s|$)/.test(trimmed)) {
        question.feedback.incorrect = trimmed.substring(1).trim();
        lastTarget = 'incorrect';
      }
      // Multiple choice answers: a) b) or A) B), optionally prefixed with *
      else if ((m = trimmed.match(/^(\*)?([a-zA-Z])\)\s+(.*)$/))) {
        question.answers.push({
          id: m[2],
          text: m[3],
          correct: !!m[1],
          feedback: ''
        });
        question.type = 'multiple_choice';
        lastTarget = 'answer';
      }
      // Multiple answers (checkboxes)
      else if ((m = trimmed.match(/^\[(\*|\s?)\]\s+(.*)$/))) {
        question.answers.push({
          id: `ans_${question.answers.length}`,
          text: m[2],
          correct: m[1] === '*',
          feedback: ''
        });
        question.type = 'multiple_answers';
        lastTarget = 'answer';
      }
      // Numerical answer
      else if (trimmed.startsWith('=')) {
        question.type = 'numerical';
        question.answers.push(this.parseNumerical(trimmed.substring(1).trim()));
        lastTarget = 'none';
      }
      // Short answer
      else if (/^\*\s+/.test(trimmed)) {
        question.type = 'short_answer';
        question.answers.push({
          text: trimmed.substring(1).trim(),
          correct: true,
          feedback: ''
        });
        lastTarget = 'answer';
      }
      // Essay question
      else if (/^_{4,}$/.test(trimmed)) {
        question.type = 'essay';
        lastTarget = 'none';
      }
      // File upload
      else if (/^\^{4,}$/.test(trimmed)) {
        question.type = 'file_upload';
        lastTarget = 'none';
      }
      // Title/Points of the next question
      else if (/^(Title|Points):/.test(trimmed)) {
        // handled by the lookback of the next question
      }
      // Marker left by the AI prompt for answers it could not determine
      else if (/^REVIEW:/i.test(trimmed)) {
        this.warnings.push(`Question ${question.number}: ${trimmed.substring(7).trim() || 'needs review'}`);
      }
      // Continuation of the previous line
      else if (trimmed !== '') {
        const lastAnswer = question.answers[question.answers.length - 1];
        if (lastTarget === 'text') {
          question.text += '\n' + trimmed;
        } else if (lastTarget === 'answer' && lastAnswer) {
          lastAnswer.text += ' ' + trimmed;
        } else if (lastTarget === 'answerFeedback' && lastAnswer) {
          lastAnswer.feedback += ' ' + trimmed;
        } else if (lastTarget === 'general' || lastTarget === 'correct' || lastTarget === 'incorrect') {
          question.feedback[lastTarget] += ' ' + trimmed;
        } else {
          this.warnings.push(`Question ${question.number}: line ignored: "${this.shorten(trimmed)}"`);
        }
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
    // Format: value +- margin or [min, max] or just value (decimal comma allowed)
    if (text.includes('+-')) {
      const parts = text.split('+-').map(p => parseFloat(p.trim().replace(',', '.')));
      const value = parts[0];
      const margin = parts[1];
      return {
        type: 'range',
        value: value,
        min: value - margin,
        max: value + margin,
        correct: true
      };
    } else if (text.includes('[') && text.includes(']')) {
      const match = text.match(/\[([^,;]+)[,;]([^\]]+)\]/);
      if (match) {
        return {
          type: 'range',
          min: parseFloat(match[1].trim().replace(',', '.')),
          max: parseFloat(match[2].trim().replace(',', '.')),
          correct: true
        };
      }
    }
    return {
      type: 'exact',
      value: parseFloat(text.replace(',', '.')),
      correct: true
    };
  }

  // Flags problems that would give a wrong or unusable question after import
  validateQuestion(q, index) {
    const label = `Question ${q.number || index + 1}`;
    const warn = msg => this.warnings.push(`${label}: ${msg}`);

    if (!q.text.trim()) {
      warn('has no question text.');
    }

    if (q.type === 'multiple_choice' || q.type === 'multiple_answers') {
      const correctCount = q.answers.filter(a => a.correct).length;
      if (q.answers.length === 0) {
        warn('no answer options recognized (use "a) ...", "[ ] ..." etc.).');
        return;
      }
      if (q.answers.length < 2) {
        warn('only one answer option.');
      }
      if (correctCount === 0) {
        warn('no correct answer marked (put * before the correct answer).');
      }
      if (q.type === 'multiple_choice' && correctCount > 1) {
        warn('more than one correct answer marked; use "[*]" checkboxes for multiple correct answers.');
      }
      const ids = q.answers.map(a => a.id.toLowerCase());
      if (q.type === 'multiple_choice' && new Set(ids).size !== ids.length) {
        warn('duplicate answer letters.');
      }
      if (q.answers.some(a => !a.text.trim())) {
        warn('has an empty answer option.');
      }
    } else if (q.type === 'numerical') {
      if (q.answers.some(a => [a.value, a.min, a.max].some(v => v !== undefined && isNaN(v)))) {
        warn('numerical answer could not be read as a number.');
      }
    }
  }
}

// QTI Generator class (Canvas-compatible QTI 1.2, mirrors the structure produced by text2qti)
class QTIGenerator {
  constructor(quiz) {
    this.quiz = quiz;
    this.assessmentId = 'quiz_' + Date.now();
  }

  generateManifest() {
    const id = this.assessmentId;
    const date = new Date().toISOString().slice(0, 10);
    return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}_manifest" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource" xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_v1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/xsd/imscp_v1p1.xsd http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource http://www.imsglobal.org/profile/cc/ccv1p1/LOM/ccv1p1_lomresource_v1p0.xsd http://www.imsglobal.org/xsd/imsmd_v1p2 http://www.imsglobal.org/xsd/imsmd_v1p2p2.xsd">
  <metadata>
    <schema>IMS Content</schema>
    <schemaversion>1.1.3</schemaversion>
    <imsmd:lom>
      <imsmd:general>
        <imsmd:title>
          <imsmd:string>${this.escapeXml(this.quiz.title)}</imsmd:string>
        </imsmd:title>
      </imsmd:general>
      <imsmd:lifeCycle>
        <imsmd:contribute>
          <imsmd:date>
            <imsmd:dateTime>${date}</imsmd:dateTime>
          </imsmd:date>
        </imsmd:contribute>
      </imsmd:lifeCycle>
      <imsmd:rights>
        <imsmd:copyrightAndOtherRestrictions>
          <imsmd:value>yes</imsmd:value>
        </imsmd:copyrightAndOtherRestrictions>
        <imsmd:description>
          <imsmd:string>Private (Copyrighted) - http://en.wikipedia.org/wiki/Copyright</imsmd:string>
        </imsmd:description>
      </imsmd:rights>
    </imsmd:lom>
  </metadata>
  <organizations/>
  <resources>
    <resource identifier="${id}" type="imsqti_xmlv1p2">
      <file href="${id}/${id}.xml"/>
      <dependency identifierref="${id}_dependency"/>
    </resource>
    <resource identifier="${id}_dependency" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="${id}/assessment_meta.xml">
      <file href="${id}/assessment_meta.xml"/>
    </resource>
  </resources>
</manifest>`;
  }

  generateAssessmentMeta() {
    const id = this.assessmentId;
    const s = this.quiz.settings || {};
    const points = this.calculateTotalPoints();
    const title = this.escapeXml(this.quiz.title);
    const description = this.quiz.description ? this.html(this.quiz.description) : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<quiz identifier="${id}" xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
  <title>${title}</title>
  <description>${description}</description>
  <shuffle_answers>${!!s.shuffleAnswers}</shuffle_answers>
  <scoring_policy>keep_highest</scoring_policy>
  <hide_results></hide_results>
  <quiz_type>assignment</quiz_type>
  <points_possible>${points}</points_possible>
  <require_lockdown_browser>false</require_lockdown_browser>
  <require_lockdown_browser_for_results>false</require_lockdown_browser_for_results>
  <require_lockdown_browser_monitor>false</require_lockdown_browser_monitor>
  <lockdown_browser_monitor_data/>
  <show_correct_answers>${s.showCorrectAnswers !== false}</show_correct_answers>
  <anonymous_submissions>false</anonymous_submissions>
  <could_be_locked>false</could_be_locked>
  <allowed_attempts>1</allowed_attempts>
  <one_question_at_a_time>${!!s.oneQuestionAtATime}</one_question_at_a_time>
  <cant_go_back>${!!s.cantGoBack}</cant_go_back>
  <available>false</available>
  <one_time_results>false</one_time_results>
  <show_correct_answers_last_attempt>false</show_correct_answers_last_attempt>
  <only_visible_to_overrides>false</only_visible_to_overrides>
  <module_locked>false</module_locked>
  <assignment identifier="${id}_assignment">
    <title>${title}</title>
    <due_at/>
    <lock_at/>
    <unlock_at/>
    <module_locked>false</module_locked>
    <workflow_state>unpublished</workflow_state>
    <assignment_overrides>
    </assignment_overrides>
    <quiz_identifierref>${id}</quiz_identifierref>
    <allowed_extensions></allowed_extensions>
    <has_group_category>false</has_group_category>
    <points_possible>${points}</points_possible>
    <grading_type>points</grading_type>
    <all_day>false</all_day>
    <submission_types>online_quiz</submission_types>
    <position>1</position>
    <turnitin_enabled>false</turnitin_enabled>
    <vericite_enabled>false</vericite_enabled>
    <peer_review_count>0</peer_review_count>
    <peer_reviews>false</peer_reviews>
    <automatic_peer_reviews>false</automatic_peer_reviews>
    <anonymous_peer_reviews>false</anonymous_peer_reviews>
    <grade_group_students_individually>false</grade_group_students_individually>
    <freeze_on_copy>false</freeze_on_copy>
    <omit_from_final_grade>false</omit_from_final_grade>
    <intra_group_peer_reviews>false</intra_group_peer_reviews>
    <only_visible_to_overrides>false</only_visible_to_overrides>
    <post_to_sis>false</post_to_sis>
    <moderated_grading>false</moderated_grading>
    <grader_count>0</grader_count>
    <grader_comments_visible_to_graders>true</grader_comments_visible_to_graders>
    <anonymous_grading>false</anonymous_grading>
    <graders_anonymous_to_graders>false</graders_anonymous_to_graders>
    <grader_names_visible_to_final_grader>true</grader_names_visible_to_final_grader>
    <anonymous_instructor_annotations>false</anonymous_instructor_annotations>
    <post_policy>
      <post_manually>false</post_manually>
    </post_policy>
  </assignment>
  <assignment_group_identifierref>${id}_assignment_group</assignment_group_identifierref>
  <assignment_overrides>
  </assignment_overrides>
</quiz>`;
  }

  calculateTotalPoints() {
    return this.quiz.questions.reduce((sum, q) => sum + q.points, 0);
  }

  generateAssessment() {
    const xml = [];
    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push('<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd">');
    xml.push(`  <assessment ident="${this.assessmentId}" title="${this.escapeXml(this.quiz.title)}">`);
    xml.push('    <qtimetadata>');
    xml.push('      <qtimetadatafield>');
    xml.push('        <fieldlabel>cc_maxattempts</fieldlabel>');
    xml.push('        <fieldentry>1</fieldentry>');
    xml.push('      </qtimetadatafield>');
    xml.push('    </qtimetadata>');
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
    const itemId = `${this.assessmentId}_question_${index + 1}`;
    const choiceIds = question.answers.map((a, i) => `${itemId}_choice_${i + 1}`);
    const isChoice = question.type === 'multiple_choice' || question.type === 'multiple_answers';
    const hasChoices = isChoice || question.type === 'short_answer';
    const xml = [];

    xml.push(`      <item ident="${itemId}" title="${this.escapeXml(question.title || 'Question')}">`);

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
    xml.push('            <qtimetadatafield>');
    xml.push('              <fieldlabel>original_answer_ids</fieldlabel>');
    xml.push(`              <fieldentry>${hasChoices ? choiceIds.join(',') : ''}</fieldentry>`);
    xml.push('            </qtimetadatafield>');
    xml.push('            <qtimetadatafield>');
    xml.push('              <fieldlabel>assessment_question_identifierref</fieldlabel>');
    xml.push(`              <fieldentry>${itemId}_ref</fieldentry>`);
    xml.push('            </qtimetadatafield>');
    xml.push('          </qtimetadata>');
    xml.push('        </itemmetadata>');

    // Presentation
    xml.push('        <presentation>');
    xml.push('          <material>');
    xml.push(`            <mattext texttype="text/html">${this.html(question.text)}</mattext>`);
    xml.push('          </material>');

    if (isChoice) {
      xml.push(`          <response_lid ident="response1" rcardinality="${question.type === 'multiple_answers' ? 'Multiple' : 'Single'}">`);
      xml.push('            <render_choice>');
      question.answers.forEach((answer, i) => {
        xml.push(`              <response_label ident="${choiceIds[i]}">`);
        xml.push('                <material>');
        xml.push(`                  <mattext texttype="text/html">${this.html(answer.text)}</mattext>`);
        xml.push('                </material>');
        xml.push('              </response_label>');
      });
      xml.push('            </render_choice>');
      xml.push('          </response_lid>');
    } else if (question.type === 'numerical') {
      xml.push('          <response_str ident="response1" rcardinality="Single">');
      xml.push('            <render_fib fibtype="Decimal">');
      xml.push('              <response_label ident="answer1"/>');
      xml.push('            </render_fib>');
      xml.push('          </response_str>');
    } else if (question.type === 'short_answer' || question.type === 'essay') {
      xml.push('          <response_str ident="response1" rcardinality="Single">');
      xml.push('            <render_fib>');
      xml.push('              <response_label ident="answer1" rshuffle="No"/>');
      xml.push('            </render_fib>');
      xml.push('          </response_str>');
    }

    xml.push('        </presentation>');

    // Response processing
    const fb = question.feedback;
    const feedbackItems = [];
    const feedbackCondition = (cond, linkrefid) => {
      xml.push('          <respcondition continue="Yes">');
      xml.push(`            <conditionvar>${cond}</conditionvar>`);
      xml.push(`            <displayfeedback feedbacktype="Response" linkrefid="${linkrefid}"/>`);
      xml.push('          </respcondition>');
    };

    xml.push('        <resprocessing>');
    xml.push('          <outcomes>');
    xml.push('            <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>');
    xml.push('          </outcomes>');

    if (fb.general) {
      feedbackCondition('<other/>', 'general_fb');
      feedbackItems.push(['general_fb', fb.general]);
    }

    if (isChoice) {
      // Feedback for individual answers
      question.answers.forEach((answer, i) => {
        if (answer.feedback) {
          const fbId = `${choiceIds[i]}_fb`;
          feedbackCondition(`<varequal respident="response1">${choiceIds[i]}</varequal>`, fbId);
          feedbackItems.push([fbId, answer.feedback]);
        }
      });
    }

    const scoreAndCorrectFeedback = () => {
      xml.push('            <setvar action="Set" varname="SCORE">100</setvar>');
      if (fb.correct) {
        xml.push('            <displayfeedback feedbacktype="Response" linkrefid="correct_fb"/>');
        feedbackItems.push(['correct_fb', fb.correct]);
      }
    };

    const correctIds = choiceIds.filter((id, i) => question.answers[i].correct);
    const wrongIds = choiceIds.filter((id, i) => !question.answers[i].correct);

    if (question.type === 'multiple_choice' && correctIds.length > 0) {
      xml.push('          <respcondition continue="No">');
      xml.push('            <conditionvar>');
      if (correctIds.length === 1) {
        xml.push(`              <varequal respident="response1">${correctIds[0]}</varequal>`);
      } else {
        xml.push('              <or>');
        correctIds.forEach(id => xml.push(`                <varequal respident="response1">${id}</varequal>`));
        xml.push('              </or>');
      }
      xml.push('            </conditionvar>');
      scoreAndCorrectFeedback();
      xml.push('          </respcondition>');
    } else if (question.type === 'multiple_answers' && correctIds.length > 0) {
      // All correct answers selected and no wrong ones
      xml.push('          <respcondition continue="No">');
      xml.push('            <conditionvar>');
      xml.push('              <and>');
      correctIds.forEach(id => xml.push(`                <varequal respident="response1">${id}</varequal>`));
      wrongIds.forEach(id => {
        xml.push('                <not>');
        xml.push(`                  <varequal respident="response1">${id}</varequal>`);
        xml.push('                </not>');
      });
      xml.push('              </and>');
      xml.push('            </conditionvar>');
      scoreAndCorrectFeedback();
      xml.push('          </respcondition>');
    } else if (question.type === 'numerical') {
      question.answers.forEach(answer => {
        xml.push('          <respcondition continue="No">');
        xml.push('            <conditionvar>');
        if (answer.type === 'range') {
          // Canvas matches the exact value or anything inside the range
          xml.push('              <or>');
          if (answer.value !== undefined) {
            xml.push(`                <varequal respident="response1">${answer.value}</varequal>`);
          }
          xml.push('                <and>');
          xml.push(`                  <vargte respident="response1">${answer.min}</vargte>`);
          xml.push(`                  <varlte respident="response1">${answer.max}</varlte>`);
          xml.push('                </and>');
          xml.push('              </or>');
        } else {
          xml.push(`              <varequal respident="response1">${answer.value}</varequal>`);
        }
        xml.push('            </conditionvar>');
        scoreAndCorrectFeedback();
        xml.push('          </respcondition>');
      });
    } else if (question.type === 'short_answer') {
      xml.push('          <respcondition continue="No">');
      xml.push('            <conditionvar>');
      question.answers.forEach(answer => {
        xml.push(`              <varequal respident="response1">${this.escapeXml(answer.text)}</varequal>`);
      });
      xml.push('            </conditionvar>');
      scoreAndCorrectFeedback();
      xml.push('          </respcondition>');
    } else if (question.type === 'essay') {
      xml.push('          <respcondition continue="No">');
      xml.push('            <conditionvar>');
      xml.push('              <other/>');
      xml.push('            </conditionvar>');
      xml.push('          </respcondition>');
    }

    if (fb.incorrect && question.type !== 'essay' && question.type !== 'file_upload') {
      feedbackCondition('<other/>', 'general_incorrect_fb');
      feedbackItems.push(['general_incorrect_fb', fb.incorrect]);
    }

    xml.push('        </resprocessing>');

    // Feedback texts
    feedbackItems.forEach(([id, text]) => {
      xml.push(`        <itemfeedback ident="${id}">`);
      xml.push('          <flow_mat>');
      xml.push('            <material>');
      xml.push(`              <mattext texttype="text/html">${this.html(text)}</mattext>`);
      xml.push('            </material>');
      xml.push('          </flow_mat>');
      xml.push('        </itemfeedback>');
    });

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
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Plain text -> HTML paragraph (HTML-escaped), then XML-escaped for use inside an element
  html(text) {
    const htmlText = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
    return this.escapeXml(`<p>${htmlText}</p>`);
  }

  async generateZip() {
    const zip = new JSZip();
    const id = this.assessmentId;

    zip.file('imsmanifest.xml', this.generateManifest());
    const folder = zip.folder(id);
    folder.file('assessment_meta.xml', this.generateAssessmentMeta());
    folder.file(`${id}.xml`, this.generateAssessment());

    return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
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
    this.warningContainer = document.getElementById('warningContainer');
    this.copyPromptBtn = document.getElementById('copyPromptBtn');
    
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
    this.copyPromptBtn.addEventListener('click', () => this.handleCopyPrompt());
    
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
      this.hideWarnings();
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
    
    this.showWarnings(result.warnings);
    this.renderPreview(result.quiz);
    this.updateStatus();
  }

  showWarnings(warnings) {
    if (warnings.length === 0) {
      this.hideWarnings();
      return;
    }
    const items = warnings.map(w => `<li>${this.escapeHtml(w)}</li>`).join('');
    this.warningContainer.innerHTML = `<strong>Check before importing (${warnings.length}):</strong><ul>${items}</ul>`;
    this.warningContainer.style.display = 'block';
  }

  hideWarnings() {
    this.warningContainer.style.display = 'none';
  }

  async handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      this.showStatus('AI prompt copied. Paste it into your AI tool together with the existing test.');
    } catch (error) {
      this.editor.value = AI_PROMPT;
      this.handleEditorChange();
      this.showStatus('Could not access the clipboard; the prompt was placed in the editor instead.');
    }
    setTimeout(() => this.updateStatus(), 4000);
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
    
    html.push(`  <div class="question-text">${this.escapeHtml(question.text).replace(/\n/g, '<br>')}</div>`);
    
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
    const answerFeedback = question.answers.filter(a => a.feedback);
    const hasFeedback = question.feedback.general || question.feedback.correct || question.feedback.incorrect || answerFeedback.length > 0;
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
      answerFeedback.forEach(answer => {
        html.push(`    <div class="feedback-item"><strong>For ${this.escapeHtml(answer.id)}:</strong> ${this.escapeHtml(answer.feedback)}</div>`);
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
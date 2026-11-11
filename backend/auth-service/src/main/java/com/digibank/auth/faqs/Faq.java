package com.digibank.auth.faqs;

import jakarta.persistence.*;

@Entity
@Table(name = "faqs")
public class Faq {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String category;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String question;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String answer;

    // Hebrew translations: nullable, so a row without one just shows the English text (as the Worker's faqs).
    @Column(columnDefinition = "TEXT")
    private String questionHe;

    @Column(columnDefinition = "TEXT")
    private String answerHe;

    private String videoId;
    private Integer displayOrder = 0;

    public Faq() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getQuestion() { return question; }
    public void setQuestion(String question) { this.question = question; }

    public String getAnswer() { return answer; }
    public void setAnswer(String answer) { this.answer = answer; }

    public String getQuestionHe() { return questionHe; }
    public void setQuestionHe(String questionHe) { this.questionHe = questionHe; }

    public String getAnswerHe() { return answerHe; }
    public void setAnswerHe(String answerHe) { this.answerHe = answerHe; }

    public String getVideoId() { return videoId; }
    public void setVideoId(String videoId) { this.videoId = videoId; }

    public Integer getDisplayOrder() { return displayOrder; }
    public void setDisplayOrder(Integer displayOrder) { this.displayOrder = displayOrder; }
}

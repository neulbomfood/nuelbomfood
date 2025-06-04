// 자유글 카드 템플릿
window.freePostTemplate = post => `
    <div class="feed-card" data-post-id="${post.id}">
        <div class="feed-card-content">
            <div class="feed-card-meta">
                <div class="feed-card-author">
                    <div class="feed-card-avatar">익</div>
                    <div class="feed-card-author-info">
                        <div class="feed-card-author-name">익명</div>
                        <div class="feed-card-time">${window.formatTime(post.timestamp)}</div>
                    </div>
                </div>
            </div>
            <div class="feed-card-text">${post.content}</div>
            <div class="feed-card-actions">
                <button class="story-action-btn" onclick="window.toggleLike('free', '${post.id}')">
                    <span id="like-icon-free-${post.id}">${post.isLiked ? '❤️' : '🤍'}</span>
                    <span id="like-count-free-${post.id}">${post.likes || 0}</span>
                </button>
                <button class="story-action-btn comment-btn" onclick="window.toggleComments('free', '${post.id}')">
                    <span>💬</span>
                    <span id="comment-count-free-${post.id}">${post.commentCount || 0}</span>
                </button>
            </div>
            <!-- 댓글 섹션 -->
            <div class="story-comments-section" id="comments-free-${post.id}">
                <div class="story-comments-header">
                    <h3>댓글 <span id="comment-header-count-free-${post.id}">${post.commentCount || 0}</span>개</h3>
                </div>
                <div class="story-comments-list" id="comment-list-free-${post.id}"></div>
                <div class="story-comment-input">
                    <div class="story-comment-form">
                        <textarea id="comment-input-free-${post.id}" 
                                  class="story-comment-textarea" 
                                  placeholder="댓글을 입력하세요... (+30P)" 
                                  maxlength="200"></textarea>
                        <button onclick="window.submitComment('free', '${post.id}')" 
                                class="story-comment-submit">등록</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
`;

// 브랜드 스토리 카드 템플릿
window.brandStoryTemplate = post => `
    <div class="story-card" data-post-id="${post.id}">
        ${post.imageUrl ? 
            `<img src="${post.imageUrl}" alt="브랜드 이미지" class="story-card-image">` : 
            '<div class="story-card-image" style="display:flex;align-items:center;justify-content:center;font-size:64px;background:linear-gradient(135deg,#356c55,#4a7c59);">🌿</div>'
        }
        <div class="story-card-content">
            <h3 class="story-card-title">${post.title || '늘봄 브랜드 이야기'}</h3>
            <p class="story-card-text">${post.content}</p>
            <div class="story-card-meta">
                <div class="story-card-author">
                    <div class="story-card-avatar">늘</div>
                    <div class="story-card-author-info">
                        <div class="story-card-author-name">${post.author || '늘봄팀'}</div>
                        <div class="story-card-time">${window.formatTime(post.timestamp)}</div>
                    </div>
                </div>
                <div class="story-card-actions">
                    <button class="story-action-btn" onclick="window.toggleLike('brand', '${post.id}')">
                        <span id="like-icon-brand-${post.id}">${post.isLiked ? '❤️' : '🤍'}</span>
                        <span id="like-count-brand-${post.id}">${post.likes || 0}</span>
                    </button>
                    <button class="story-action-btn comment-btn" onclick="window.toggleComments('brand', '${post.id}')">
                        <span>💬</span>
                        <span id="comment-count-brand-${post.id}">${post.commentCount || 0}</span>
                    </button>
                </div>
            </div>
        </div>
        <div class="story-comments-section" id="comments-brand-${post.id}">
            <div class="story-comments-header">
                댓글 <span id="comment-header-count-brand-${post.id}">${post.commentCount || 0}</span>개
            </div>
            <div class="story-comments-list" id="comment-list-brand-${post.id}"></div>
            <div class="story-comment-input">
                <div class="story-comment-form">
                    <textarea id="comment-input-brand-${post.id}" 
                              class="story-comment-textarea" 
                              placeholder="댓글을 입력하세요... (+30P)" 
                              maxlength="200"></textarea>
                    <button onclick="window.submitComment('brand', '${post.id}')" 
                            class="story-comment-submit">등록</button>
                </div>
            </div>
        </div>
    </div>
`;

// 질문 카드 템플릿
window.questionCardTemplate = question => `
    <div class="story-card question-card" data-post-id="${question.id}">
        <div class="story-card-content">
            <h3 class="story-card-title">📝 ${question.question}</h3>
            <div class="question-options">
                ${question.options ? question.options.map((option, optionIndex) => `
                    <button class="question-option" 
                            onclick="window.answerQuestion('${question.id}', ${optionIndex})"
                            id="option-${question.id}-${optionIndex}">
                        ${option}
                    </button>
                `).join('') : ''}
            </div>
            <div class="question-reward">💡 답변하면 30P가 적립됩니다!</div>
        </div>
        <div class="story-comments-section" id="comments-question-${question.id}">
            <div class="story-comments-header">
                댓글 <span id="comment-header-count-question-${question.id}">${question.commentCount || 0}</span>개
            </div>
            <div class="story-comments-list" id="comment-list-question-${question.id}"></div>
            <div class="story-comment-input">
                <div class="story-comment-form">
                    <textarea id="comment-input-question-${question.id}" 
                              class="story-comment-textarea" 
                              placeholder="댓글을 입력하세요... (+30P)" 
                              maxlength="200"></textarea>
                    <button onclick="window.submitComment('question', '${question.id}')" 
                            class="story-comment-submit">등록</button>
                </div>
            </div>
        </div>
    </div>
`; 
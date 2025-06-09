// 댓글 관련 함수들
window.toggleComments = async function(postType, postId) {
    console.log('댓글 토글:', { postType, postId });
    
    const commentsSection = document.getElementById(`comments-${postType}-${postId}`);
    if (!commentsSection) {
        console.error('댓글 섹션을 찾을 수 없습니다.');
        return;
    }
    
    const isVisible = commentsSection.classList.contains('active');
    
    if (!isVisible) {
        // 댓글 섹션 표시
        commentsSection.classList.add('active');
        
        // 댓글 목록 로드
        await window.loadComments(postType, postId);
        
        // 입력창에 포커스
        const input = document.getElementById(`comment-input-${postType}-${postId}`);
        if (input) {
            input.focus();
        }
    } else {
        // 댓글 섹션 숨기기
        commentsSection.classList.remove('active');
    }
};

window.loadComments = async function(postType, postId) {
    const container = document.getElementById(`comment-list-${postType}-${postId}`);
    if (!container) return;
    
    try {
        const comments = await window.getComments(postType, postId);
        
        if (comments.length === 0) {
            container.innerHTML = '<div class="no-comments">첫 번째 댓글을 남겨보세요!</div>';
            return;
        }
        
        container.innerHTML = comments.map(comment => `
            <div class="story-comment">
                <div class="story-comment-header">
                    <div class="story-comment-author">
                        <div class="story-comment-avatar">${comment.nickname ? comment.nickname[0] : '익'}</div>
                        <div class="story-comment-info">
                            <div class="story-comment-name">${comment.nickname || '익명'}</div>
                            <div class="story-comment-time">${window.formatTime(comment.timestamp)}</div>
                        </div>
                    </div>
                </div>
                <div class="story-comment-text">${comment.text || comment.content}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('댓글 로드 오류:', error);
        container.innerHTML = '<div class="error-message">댓글을 불러오는 중 오류가 발생했습니다.</div>';
    }
};

window.submitComment = async function(postType, postId) {
    const input = document.getElementById(`comment-input-${postType}-${postId}`);
    if (!input) {
        console.error('댓글 입력창을 찾을 수 없습니다.');
        return;
    }

    const content = input.value.trim();
    
    if (!content) {
        window.showSalonToast('댓글을 입력해주세요.', 'warning');
        return;
    }
    
    if (content.length > 200) {
        window.showSalonToast('댓글은 200자 이하로 입력해주세요.', 'warning');
        return;
    }
    
    try {
        const submitBtn = input.parentNode.querySelector('.story-comment-submit');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '등록 중...';
        }
        
        // 댓글 추가
        await window.addComment(postType, postId, content);
        
        // 입력창 초기화
        input.value = '';
        
        // 포인트 지급 처리
        const userId = window.getUserId();
        const actionId = `comment_${postType}_${postId}_${userId}`;
        
        try {
            // 포인트 지급 시도 (중복 체크 포함)
            await window.addUserPoints(30, 'comment', actionId);
            window.showSalonToast('댓글이 등록되었습니다! +30P 적립 🎉');
        } catch (pointError) {
            if (pointError.code === 'duplicate-action') {
                // 이미 포인트를 받은 경우
                window.showSalonToast('댓글이 등록되었습니다!');
            } else {
                console.error('포인트 지급 오류:', pointError);
                window.showSalonToast('댓글은 등록되었으나, 포인트 지급에 실패했습니다.', 'warning');
            }
        }
        
        // 포인트 표시 업데이트
        const points = await window.getUserPoints();
        const pointDisplay = document.getElementById('habit-salon-my-point');
        if (pointDisplay) {
            pointDisplay.textContent = points;
        }
        
        // 댓글 목록 새로고침
        await window.loadComments(postType, postId);
        
        // 댓글 수 업데이트
        const countElements = [
            document.getElementById(`comment-count-${postType}-${postId}`),
            document.getElementById(`comment-header-count-${postType}-${postId}`)
        ];
        
        countElements.forEach(element => {
            if (element) {
                const currentCount = parseInt(element.textContent) || 0;
                element.textContent = currentCount + 1;
                element.classList.add('comment-count-update');
                setTimeout(() => {
                    element.classList.remove('comment-count-update');
                }, 300);
            }
        });
        
        // 버튼 상태 복구
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '등록';
        }
        
    } catch (error) {
        console.error('댓글 작성 오류:', error);
        window.showSalonToast('댓글 작성 중 오류가 발생했습니다.', 'error');
        
        // 버튼 상태 복구
        const submitBtn = input.parentNode.querySelector('.story-comment-submit');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '등록';
        }
    }
}; 
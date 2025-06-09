// 실시간 동기화 관련 함수들
import { onSnapshot, query, collection, orderBy, where } from "firebase/firestore";

// 자유글 실시간 리스너
window.initFreePostsListener = () => {
    const unsubscribe = onSnapshot(
        query(collection(db, 'user_posts'), orderBy('timestamp', 'desc')),
        (snapshot) => {
            const posts = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            window.renderFreeFeed(posts);
        },
        (error) => {
            console.error('자유글 실시간 감지 오류:', error);
        }
    );
    return unsubscribe;
};

// 댓글 실시간 리스너
window.initCommentsListener = (postType, postId) => {
    const unsubscribe = onSnapshot(
        query(
            collection(db, `${postType}_comments`),
            where('postId', '==', postId)
        ),
        (snapshot) => {
            const comments = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            // 클라이언트에서 timestamp로 정렬
            .sort((a, b) => {
                const timeA = a.timestamp?.seconds || 0;
                const timeB = b.timestamp?.seconds || 0;
                return timeB - timeA;  // 내림차순 정렬
            });
            
            // 댓글 목록 업데이트
            const container = document.getElementById(`comment-list-${postType}-${postId}`);
            if (container) {
                if (comments.length === 0) {
                    container.innerHTML = '<div style="text-align:center;padding:20px;color:#666;">첫 번째 댓글을 남겨보세요!</div>';
                } else {
                    container.innerHTML = comments.map(comment => `
                        <div class="story-comment">
                            <div class="story-comment-header">
                                <div class="story-comment-author">
                                    <div class="story-comment-avatar">익</div>
                                    <div class="story-comment-info">
                                        <div class="story-comment-name">익명</div>
                                        <div class="story-comment-time">${window.formatTime(comment.timestamp)}</div>
                                    </div>
                                </div>
                            </div>
                            <div class="story-comment-text">${comment.text}</div>
                        </div>
                    `).join('');
                }
            }
            
            // 댓글 수 업데이트
            const countElements = [
                document.getElementById(`comment-count-${postType}-${postId}`),
                document.getElementById(`comment-header-count-${postType}-${postId}`)
            ];
            
            countElements.forEach(countElement => {
                if (countElement) {
                    countElement.textContent = comments.length;
                    countElement.classList.add('comment-count-update');
                    setTimeout(() => {
                        countElement.classList.remove('comment-count-update');
                    }, 300);
                }
            });
        },
        (error) => {
            console.error('댓글 실시간 감지 오류:', error);
        }
    );
    return unsubscribe;
};

// 좋아요 실시간 리스너
window.initLikesListener = (postType, postId) => {
    const unsubscribe = onSnapshot(
        query(
            collection(db, 'likes'),
            where('postType', '==', postType),
            where('postId', '==', postId)
        ),
        (snapshot) => {
            const totalLikes = snapshot.docs.length;
            const isLiked = snapshot.docs.some(doc => doc.data().userId === window.currentUserId);
            
            // 좋아요 아이콘 업데이트
            const likeIcon = document.getElementById(`like-icon-${postType}-${postId}`);
            if (likeIcon) {
                likeIcon.textContent = isLiked ? '❤️' : '🤍';
            }
            
            // 좋아요 수 업데이트
            const likeCountElement = document.getElementById(`like-count-${postType}-${postId}`);
            if (likeCountElement) {
                likeCountElement.textContent = totalLikes;
                likeCountElement.classList.add('like-count-update');
                setTimeout(() => {
                    likeCountElement.classList.remove('like-count-update');
                }, 300);
            }
        },
        (error) => {
            console.error('좋아요 실시간 감지 오류:', error);
        }
    );
    return unsubscribe;
};

// 리스너 초기화 및 정리
let freePostsUnsubscribe = null;
let commentsUnsubscribes = new Map();
let likesUnsubscribes = new Map();

// 전체 리스너 초기화
window.initAllListeners = () => {
    // 기존 리스너 정리
    cleanupAllListeners();
    
    // 자유글 리스너 시작
    freePostsUnsubscribe = window.initFreePostsListener();
};

// 특정 포스트의 댓글/좋아요 리스너 초기화
window.initPostListeners = (postType, postId) => {
    // 기존 리스너 정리
    cleanupPostListeners(postType, postId);
    
    // 새 리스너 시작
    const commentUnsubscribe = window.initCommentsListener(postType, postId);
    const likeUnsubscribe = window.initLikesListener(postType, postId);
    
    // 리스너 저장
    commentsUnsubscribes.set(`${postType}-${postId}`, commentUnsubscribe);
    likesUnsubscribes.set(`${postType}-${postId}`, likeUnsubscribe);
};

// 특정 포스트의 리스너 정리
window.cleanupPostListeners = (postType, postId) => {
    const commentKey = `${postType}-${postId}`;
    const likeKey = `${postType}-${postId}`;
    
    if (commentsUnsubscribes.has(commentKey)) {
        commentsUnsubscribes.get(commentKey)();
        commentsUnsubscribes.delete(commentKey);
    }
    
    if (likesUnsubscribes.has(likeKey)) {
        likesUnsubscribes.get(likeKey)();
        likesUnsubscribes.delete(likeKey);
    }
};

// 모든 리스너 정리
window.cleanupAllListeners = () => {
    if (freePostsUnsubscribe) {
        freePostsUnsubscribe();
        freePostsUnsubscribe = null;
    }
    
    commentsUnsubscribes.forEach(unsubscribe => unsubscribe());
    commentsUnsubscribes.clear();
    
    likesUnsubscribes.forEach(unsubscribe => unsubscribe());
    likesUnsubscribes.clear();
}; 
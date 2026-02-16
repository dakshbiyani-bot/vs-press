import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { 
  FiSun, FiMoon, FiMenu, FiX, FiHeart, FiMessageCircle, 
  FiUser, FiLogOut, FiEdit2, FiTrash2, FiPlus, FiArrowLeft,
  FiMail, FiLock, FiEye, FiEyeOff, FiUpload, FiShare2
} from 'react-icons/fi';

// ============ FIREBASE ============
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, updateProfile 
} from 'firebase/auth';
import {
  getFirestore, collection, query, orderBy, limit, getDocs,
  doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp,
  where, increment, arrayUnion, arrayRemove, Timestamp
} from 'firebase/firestore';
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ============ TYPES ============
interface Article {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  imageUrl: string;
  author: string;
  authorId: string;
  createdAt: Timestamp;
  category: string;
  likes: number;
  likedBy: string[];
  commentsCount: number;
  featured: boolean;
}

interface Comment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: Timestamp;
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  createdAt: Timestamp;
}

const categories = ['News', 'Sports', 'Arts', 'Opinion', 'Features', 'Events', 'Science', 'Campus'];

// ============ UTILS ============
const formatDate = (date: any) => format(date?.toDate?.() || new Date(), 'MMM d, yyyy');
const readingTime = (content: string) => Math.max(1, Math.ceil(content.split(/\s+/).length / 200));
const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// ============ MAIN APP ============
export default function App() {
  const router = useRouter();
  const { slug } = router.query;
  const page = Array.isArray(slug) ? slug[0] : slug || 'home';

  // ============ STATE ============
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [menuOpen, setMenuOpen] = useState(false);
  
  // Data states
  const [articles, setArticles] = useState<Article[]>([]);
  const [article, setArticle] = useState<Article | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [filter, setFilter] = useState('All');
  
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [articleForm, setArticleForm] = useState({
    title: '', excerpt: '', content: '', category: categories[0], imageUrl: '', featured: false
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [commentText, setCommentText] = useState('');

  // ============ AUTH ============
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        setProfile(userDoc.exists() ? userDoc.data() as UserProfile : null);
      } else setProfile(null);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // ============ THEME ============
  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark';
    const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(saved || prefers);
    document.documentElement.classList.toggle('dark', (saved || prefers) === 'dark');
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  // ============ DATA FETCHING ============
  useEffect(() => {
    const fetchData = async () => {
      if (page === 'home' || page === 'articles') {
        const q = query(collection(db, 'articles'), orderBy('createdAt', 'desc'), limit(page === 'home' ? 9 : 50));
        const snapshot = await getDocs(q);
        setArticles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Article)));
      }
      if (page === 'article' && router.query.id) {
        const docRef = doc(db, 'articles', router.query.id as string);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setArticle({ id: docSnap.id, ...docSnap.data() } as Article);
          await updateDoc(docRef, { views: increment(1) });
          
          const commentsSnap = await getDocs(query(collection(db, 'articles', router.query.id as string, 'comments'), orderBy('createdAt', 'desc')));
          setComments(commentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Comment)));
        }
      }
    };
    fetchData();
  }, [page, router.query.id]);

  // ============ AUTH ACTIONS ============
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(res.user, { displayName: name });
      const isAdmin = email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;
      await addDoc(collection(db, 'users'), {
        uid: res.user.uid, email, displayName: name, role: isAdmin ? 'admin' : 'user', createdAt: serverTimestamp()
      });
      toast.success('Account created!');
      router.push('/');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast.success('Logged in!');
      router.push('/');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    toast.success('Logged out');
    router.push('/');
  };

  // ============ ARTICLE ACTIONS ============
  const handleLike = async (articleId: string) => {
    if (!user) return toast.error('Login to like');
    const docRef = doc(db, 'articles', articleId);
    const isLiked = article?.likedBy?.includes(user.uid);
    await updateDoc(docRef, {
      likes: increment(isLiked ? -1 : 1),
      likedBy: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid)
    });
    if (article) setArticle({ ...article, likes: article.likes + (isLiked ? -1 : 1) });
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error('Login to comment');
    if (!commentText.trim()) return;
    
    await addDoc(collection(db, 'articles', article!.id, 'comments'), {
      userId: user.uid, userName: profile?.displayName, text: commentText, createdAt: serverTimestamp()
    });
    setCommentText('');
    const commentsSnap = await getDocs(query(collection(db, 'articles', article!.id, 'comments'), orderBy('createdAt', 'desc')));
    setComments(commentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Comment)));
    toast.success('Comment posted!');
  };

  const handleDeleteComment = async (commentId: string, userId: string) => {
    if (!user || (user.uid !== userId && profile?.role !== 'admin')) return toast.error('Not authorized');
    await deleteDoc(doc(db, 'articles', article!.id, 'comments', commentId));
    setComments(comments.filter(c => c.id !== commentId));
    toast.success('Comment deleted');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be < 5MB');
    
    setUploading(true);
    const storageRef = ref(storage, `articles/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    setArticleForm({ ...articleForm, imageUrl: url });
    setUploading(false);
    toast.success('Image uploaded');
  };

  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!articleForm.title || !articleForm.content || !articleForm.imageUrl) return toast.error('Fill all fields');
    
    if (editingId) {
      await updateDoc(doc(db, 'articles', editingId), { ...articleForm, updatedAt: serverTimestamp() });
      toast.success('Article updated');
    } else {
      await addDoc(collection(db, 'articles'), {
        ...articleForm, author: profile?.displayName, authorId: user.uid, createdAt: serverTimestamp(),
        likes: 0, likedBy: [], commentsCount: 0
      });
      toast.success('Article created');
    }
    setEditingId(null);
    setArticleForm({ title: '', excerpt: '', content: '', category: categories[0], imageUrl: '', featured: false });
    router.push('/admin');
  };

  const handleDeleteArticle = async (id: string) => {
    if (confirm('Delete article?')) {
      await deleteDoc(doc(db, 'articles', id));
      setArticles(articles.filter(a => a.id !== id));
      toast.success('Article deleted');
    }
  };

  // ============ RENDER PAGES ============
  const renderHome = () => (
    <div className="container-custom py-8">
      {articles.filter(a => a.featured).length > 0 && (
        <div className="relative h-96 mb-12 rounded-2xl overflow-hidden">
          <Image src={articles.find(a => a.featured)?.imageUrl || ''} alt="Featured" fill className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-8">
            <div className="text-white max-w-2xl">
              <span className="bg-gold text-navy px-3 py-1 rounded-full text-sm mb-2 inline-block">
                {articles.find(a => a.featured)?.category}
              </span>
              <h2 className="text-3xl font-bold mb-2">{articles.find(a => a.featured)?.title}</h2>
              <p className="mb-4">{articles.find(a => a.featured)?.excerpt}</p>
              <button onClick={() => router.push(`/article/${articles.find(a => a.featured)?.id}`)} className="btn bg-gold text-navy">
                Read More
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="text-3xl font-bold mb-6">Latest Stories</h2>
      <div className="grid md:grid-cols-3 gap-6">
        {articles.map((a, i) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="card cursor-pointer group" onClick={() => router.push(`/article/${a.id}`)}>
            <div className="relative h-48 overflow-hidden">
              <Image src={a.imageUrl} alt={a.title} fill className="object-cover group-hover:scale-110 transition" />
              <span className="absolute top-2 left-2 bg-navy text-white px-2 py-1 rounded-full text-xs">{a.category}</span>
            </div>
            <div className="p-4">
              <h3 className="font-bold text-lg mb-2 line-clamp-2">{a.title}</h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm mb-4 line-clamp-3">{a.excerpt}</p>
              <div className="flex justify-between text-sm text-gray-500">
                <span>{a.author} • {formatDate(a.createdAt)}</span>
                <div className="flex space-x-3">
                  <span className="flex items-center space-x-1"><FiHeart />{a.likes}</span>
                  <span className="flex items-center space-x-1"><FiMessageCircle />{a.commentsCount}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="text-center mt-8">
        <button onClick={() => router.push('/articles')} className="btn border-2 border-navy text-navy dark:border-gold dark:text-gold">
          View All Articles
        </button>
      </div>
    </div>
  );

  const renderArticles = () => (
    <div className="container-custom py-8">
      <h1 className="text-4xl font-bold mb-6">All Articles</h1>
      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => setFilter('All')} className={`px-4 py-2 rounded-full ${filter === 'All' ? 'bg-navy text-white dark:bg-gold dark:text-navy' : 'bg-gray-200 dark:bg-gray-700'}`}>
          All
        </button>
        {categories.map(c => (
          <button key={c} onClick={() => setFilter(c)} className={`px-4 py-2 rounded-full ${filter === c ? 'bg-navy text-white dark:bg-gold dark:text-navy' : 'bg-gray-200 dark:bg-gray-700'}`}>
            {c}
          </button>
        ))}
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        {articles.filter(a => filter === 'All' || a.category === filter).map(a => (
          <div key={a.id} className="card cursor-pointer" onClick={() => router.push(`/article/${a.id}`)}>
            <div className="relative h-48">
              <Image src={a.imageUrl} alt={a.title} fill className="object-cover" />
            </div>
            <div className="p-4">
              <h3 className="font-bold text-lg mb-2">{a.title}</h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm mb-4 line-clamp-2">{a.excerpt}</p>
              <div className="flex justify-between text-sm">
                <span>{formatDate(a.createdAt)}</span>
                <div className="flex space-x-3">
                  <span className="flex items-center"><FiHeart className="mr-1" />{a.likes}</span>
                  <span className="flex items-center"><FiMessageCircle className="mr-1" />{a.commentsCount}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderArticle = () => article && (
    <div className="container-custom py-8 max-w-4xl">
      <button onClick={() => router.back()} className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 mb-4">
        <FiArrowLeft /><span>Back</span>
      </button>
      
      <span className="bg-navy text-white dark:bg-gold dark:text-navy px-3 py-1 rounded-full text-sm inline-block mb-4">
        {article.category}
      </span>
      <h1 className="text-4xl font-bold mb-4">{article.title}</h1>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-full bg-navy dark:bg-gold flex items-center justify-center text-white">
            {article.author[0]}
          </div>
          <div>
            <p className="font-bold">{article.author}</p>
            <p className="text-sm text-gray-500">{formatDate(article.createdAt)} • {readingTime(article.content)} min read</p>
          </div>
        </div>
        <button onClick={() => handleLike(article.id)} className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800">
          <FiHeart className={article.likedBy?.includes(user?.uid) ? 'fill-red-500 text-red-500' : ''} />
          <span>{article.likes}</span>
        </button>
      </div>

      <div className="relative h-96 mb-8 rounded-2xl overflow-hidden">
        <Image src={article.imageUrl} alt={article.title} fill className="object-cover" />
      </div>

      <div className="prose dark:prose-invert max-w-none mb-12" dangerouslySetInnerHTML={{ __html: article.content }} />

      <div className="mt-12">
        <h3 className="text-2xl font-bold mb-4">Comments ({comments.length})</h3>
        
        {user ? (
          <form onSubmit={handleComment} className="mb-6">
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)}
              className="w-full p-3 border rounded-lg dark:bg-gray-800" rows={3} placeholder="Write a comment..." />
            <button type="submit" className="btn btn-primary mt-2">Post Comment</button>
          </form>
        ) : (
          <p className="text-center py-4">Please <button onClick={() => router.push('/login')} className="text-gold">login</button> to comment</p>
        )}

        <div className="space-y-4">
          {comments.map(c => (
            <div key={c.id} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="flex justify-between items-start">
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-full bg-navy dark:bg-gold flex items-center justify-center text-white text-sm">
                    {c.userName[0]}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-bold">{c.userName}</span>
                      <span className="text-xs text-gray-500">{formatDate(c.createdAt)}</span>
                    </div>
                    <p>{c.text}</p>
                  </div>
                </div>
                {(user?.uid === c.userId || profile?.role === 'admin') && (
                  <button onClick={() => handleDeleteComment(c.id, c.userId)} className="text-red-500">
                    <FiTrash2 />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAdmin = () => {
    if (!profile || profile.role !== 'admin') {
      return <div className="container-custom py-8 text-center">Access Denied</div>;
    }

    return (
      <div className="container-custom py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-4xl font-bold">Admin Dashboard</h1>
          <button onClick={() => setEditingId('new')} className="btn btn-primary flex items-center space-x-2">
            <FiPlus /><span>New Article</span>
          </button>
        </div>

        {editingId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setEditingId(null)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <h2 className="text-2xl font-bold mb-4">{editingId === 'new' ? 'Create Article' : 'Edit Article'}</h2>
              <form onSubmit={handleSaveArticle} className="space-y-4">
                <input type="text" placeholder="Title" value={articleForm.title} onChange={e => setArticleForm({...articleForm, title: e.target.value})}
                  className="w-full p-2 border rounded dark:bg-gray-700" required />
                
                <textarea placeholder="Excerpt" value={articleForm.excerpt} onChange={e => setArticleForm({...articleForm, excerpt: e.target.value})}
                  className="w-full p-2 border rounded dark:bg-gray-700" rows={2} required />
                
                <select value={articleForm.category} onChange={e => setArticleForm({...articleForm, category: e.target.value})}
                  className="w-full p-2 border rounded dark:bg-gray-700">
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>

                <div>
                  <label className="block mb-2">Featured Image</label>
                  {articleForm.imageUrl && (
                    <div className="relative h-32 w-32 mb-2">
                      <Image src={articleForm.imageUrl} alt="Preview" fill className="object-cover rounded" />
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="block" />
                  {uploading && <p>Uploading...</p>}
                </div>

                <textarea placeholder="Content (HTML supported)" value={articleForm.content} onChange={e => setArticleForm({...articleForm, content: e.target.value})}
                  className="w-full p-2 border rounded dark:bg-gray-700 font-mono" rows={10} required />

                <label className="flex items-center space-x-2">
                  <input type="checkbox" checked={articleForm.featured} onChange={e => setArticleForm({...articleForm, featured: e.target.checked})} />
                  <span>Featured Article</span>
                </label>

                <div className="flex justify-end space-x-2">
                  <button type="button" onClick={() => setEditingId(null)} className="px-4 py-2 border rounded">Cancel</button>
                  <button type="submit" className="btn btn-primary">Save</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-2 text-left">Title</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-left">Stats</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {articles.map(a => (
                <tr key={a.id} className="border-t dark:border-gray-700">
                  <td className="px-4 py-2">
                    <div className="flex items-center space-x-2">
                      <div className="relative w-10 h-10">
                        <Image src={a.imageUrl} alt={a.title} fill className="object-cover rounded" />
                      </div>
                      <span>{a.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">{a.category}</td>
                  <td className="px-4 py-2">❤️ {a.likes} 💬 {a.commentsCount}</td>
                  <td className="px-4 py-2">
                    <div className="flex space-x-2">
                      <button onClick={() => {
                        setEditingId(a.id);
                        setArticleForm({ title: a.title, excerpt: a.excerpt, content: a.content, category: a.category, imageUrl: a.imageUrl, featured: a.featured });
                      }} className="text-blue-500"><FiEdit2 /></button>
                      <button onClick={() => handleDeleteArticle(a.id)} className="text-red-500"><FiTrash2 /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderAuth = (isLogin: boolean) => (
    <div className="min-h-screen flex items-center justify-center py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl">
        <button onClick={() => router.push('/')} className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 mb-4">
          <FiArrowLeft /><span>Back</span>
        </button>
        
        <h2 className="text-3xl font-bold text-center mb-6">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
        
        <form onSubmit={isLogin ? handleLogin : handleSignup} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block mb-1">Full Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
                className="w-full p-2 border rounded dark:bg-gray-700" />
            </div>
          )}
          
          <div>
            <label className="block mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full p-2 border rounded dark:bg-gray-700" />
          </div>
          
          <div>
            <label className="block mb-1">Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required
                className="w-full p-2 border rounded dark:bg-gray-700 pr-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2">
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </div>
          
          <button type="submit" className="w-full btn btn-primary">{isLogin ? 'Login' : 'Sign Up'}</button>
        </form>
        
        <p className="text-center mt-4">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => router.push(isLogin ? '/signup' : '/login')} className="text-gold">
            {isLogin ? 'Sign Up' : 'Login'}
          </button>
        </p>
      </motion.div>
    </div>
  );

  // ============ LAYOUT ============
  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="fixed top-0 w-full bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-sm z-50">
        <div className="container-custom flex justify-between items-center h-16">
          <button onClick={() => router.push('/')} className="text-2xl font-bold text-navy dark:text-gold">VS Press</button>
          
          <div className="hidden md:flex items-center space-x-6">
            <button onClick={() => router.push('/')}>Home</button>
            <button onClick={() => router.push('/articles')}>Articles</button>
            {profile?.role === 'admin' && <button onClick={() => router.push('/admin')} className="text-gold">Admin</button>}
          </div>

          <div className="flex items-center space-x-4">
            <button onClick={toggleTheme} className="p-2">{theme === 'light' ? <FiMoon /> : <FiSun />}</button>
            {user ? (
              <div className="relative group">
                <button className="w-8 h-8 rounded-full bg-navy dark:bg-gold text-white flex items-center justify-center">
                  {profile?.displayName?.[0] || 'U'}
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl hidden group-hover:block">
                  <button onClick={handleLogout} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2">
                    <FiLogOut /><span>Logout</span>
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => router.push('/login')} className="btn btn-primary">Login</button>
            )}
            <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <FiX /> : <FiMenu />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {menuOpen && (
        <motion.div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMenuOpen(false)}>
          <motion.div className="absolute right-0 w-64 h-full bg-white dark:bg-gray-900 p-6" initial={{ x: '100%' }} animate={{ x: 0 }}>
            <button onClick={() => { router.push('/'); setMenuOpen(false); }} className="block w-full text-left py-2">Home</button>
            <button onClick={() => { router.push('/articles'); setMenuOpen(false); }} className="block w-full text-left py-2">Articles</button>
            {profile?.role === 'admin' && <button onClick={() => { router.push('/admin'); setMenuOpen(false); }} className="block w-full text-left py-2 text-gold">Admin</button>}
          </motion.div>
        </motion.div>
      )}

      {/* Main Content */}
      <main className="pt-16 min-h-screen">
        {page === 'home' && renderHome()}
        {page === 'articles' && renderArticles()}
        {page === 'article' && renderArticle()}
        {page === 'admin' && renderAdmin()}
        {page === 'login' && renderAuth(true)}
        {page === 'signup' && renderAuth(false)}
      </main>

      {/* Footer */}
      <footer className="bg-navy dark:bg-gray-900 text-white py-8">
        <div className="container-custom text-center">
          <p>© 2024 Victoria School Press. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

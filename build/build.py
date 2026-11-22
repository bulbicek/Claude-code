import sys
R='/home/claude/rit-repo/build/'
src=open('/home/claude/w/mikrosvet.html').read()
three=open(R+'three.min.js').read()
src=src.replace("<!--THREEJS-->","<script>"+three+"</script>",1)
head=open(R+'prefix.html').read()
i=src.index('<div id="app">')
open(sys.argv[1],'w').write(head+src[:i]+'</head><body>'+src[i:])

"""Final scoped integration fixes; used by the work-branch port workflow only."""
from pathlib import Path
import sys

root = Path(sys.argv[1])


def patch(path, before, after):
    target = root / path
    text = target.read_text(encoding="utf-8")
    assert text.count(before) == 1, (path, before[:100], text.count(before))
    target.write_text(text.replace(before, after, 1), encoding="utf-8", newline="\n")


# The existing Comic conversion adapter replaces a selected panel as part of its
# background-removal workflow. Quick Retouch is explicitly add-only. Reuse the
# existing generic importer without changing any background/BW/editor behavior.
patch("web/speech-bubble-editor.html",
      '    function initializeQuickRetouch(){',
      '''    async function addQuickRetouchPageImage(blob,name){
      if(!(blob instanceof Blob)||!["comic","comic_layout"].includes(activeWorkspace))return "";
      const editor=activeStructuralEditor();
      if(!editor)return "";
      if(activeWorkspace==="comic")return editor.addConvertedImage(blob,name);
      const safeName=String(name||"image-retouched.png").replace(/[\\\\/:*?"<>|]+/g,"-");
      const file=new File([blob],/\\.png$/i.test(safeName)?safeName:`${safeName}.png`,{type:"image/png",lastModified:Date.now()});
      pushUndo();
      const ids=await editor.importFiles([file]);
      return ids?.[0]||"";
    }
    function initializeQuickRetouch(){''')
patch("web/speech-bubble-editor.html",
      '        addPageImage:(blob,name)=>activeStructuralEditor()?.addConvertedImage?.(blob,name),',
      '        addPageImage:addQuickRetouchPageImage,')
patch("tests/quick_retouch_integration_test.cjs",
      'assert.match(editor, /activeStructuralEditor\\(\\)\\?\\.addConvertedImage/);',
      'assert.match(editor, /addPageImage:addQuickRetouchPageImage/);\nassert.match(editor, /const ids=await editor\\.importFiles\\(\\[file\\]\\)/);')

# A Page Image display name is not a filename: existing free-Comic imports strip
# extensions. Check the unchanged display conventions plus the actual PNG MIME.
patch("tests/quick_retouch_desktop_gate.cjs",
      '      assert.match(added[0].name,/-retouched\\.png$/);',
      '''      assert.equal(added[0].name,from==="comic"?"qr-shared-retouched.png":"qr-shared-retouched");
      assert.equal(added[0].mime,"image/png");
      assert.deepEqual([added[0].width,added[0].height],[1000,640]);''')
patch("tests/quick_retouch_desktop_gate.cjs",
      '      await setMode(from);\n      const prev =',
      '''      await setMode(from);
      if(from==="comic_layout") {
        await page.evaluate(async()=>{
          if(!generalComicEditor.hasPage())generalComicEditor.createPage();
          const source=(await sharedPageImageStore.list()).find(item=>/^qr-shared(?:\\.png)?$/.test(item.name));
          if(!source)throw new Error("Shared source fixture is missing");
          let panel=generalComicEditor.state().tree;
          while(panel?.kind==="split")panel=panel.first;
          if(!panel?.id)throw new Error("Comic panel fixture is missing");
          panel.image_id=source.id;
          generalComicEditor.selectPanel(panel.id);
        });
      }
      const prev =''')

import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { HybridTwinComponent } from './hybrid-twin.component';

const routes: Routes = [{ path: '', component: HybridTwinComponent }];

@NgModule({
  declarations: [HybridTwinComponent],
  imports: [CommonModule, FormsModule, RouterModule.forChild(routes)],
})
export class HybridTwinModule {}
